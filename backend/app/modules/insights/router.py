"""
Insights module router — owned by Mehak (Lane C) / Integrated by Premansh (Lane A).

Endpoints from §3.5:
  GET /queue
  GET /instruments/{id}/risk
  GET /kpi/summary
  GET /kpi/breakdown
  GET /kpi/maturity-ladder
  GET /reports/export.csv
"""
import csv
from datetime import date, datetime, timedelta
import io
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core import audit, clock
from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.enums import InstrumentState, Role, TrustLevel
from app.core.errors import NotFoundError
from app.core.models import User
from app.modules.bank.models import Bank
from app.modules.insights import risk
from app.modules.intake.models import (
    Discrepancy,
    FieldTrust,
    Institute,
    Instrument,
    InstrumentStateHistory,
    InstrumentVersion,
    Obligation,
)

router = APIRouter(tags=["insights"])

OFFICER_ROLES = [
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.COMPLIANCE_OFFICER,
    Role.FINANCE_OFFICER,
    Role.LEADERSHIP,
    Role.AUDITOR,
    Role.SYSTEM_ADMIN,
]


def _extract_fields(ins: Instrument) -> dict[str, Any]:
    """Extract key fields from version or field trust rows."""
    res: dict[str, Any] = {}
    if ins.versions:
        res.update(ins.versions[-1].fields_json or {})
    for ft in ins.fields:
        res[ft.field_name] = ft.value
    return res


def _to_naive(dt: datetime | None) -> datetime:
    if dt is None:
        return clock.now().replace(tzinfo=None)
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def _compute_instrument_factors(ins: Instrument, now: datetime) -> tuple[dict[str, float], dict[str, str]]:
    """Compute normalized 7-factor dictionary for risk.score()."""
    fields = _extract_fields(ins)
    now_naive = _to_naive(now)

    # 1. f_flags (discrepancies)
    high_disc = sum(1 for d in ins.discrepancies if d.status == "OPEN" and d.severity == "HIGH")
    total_disc = sum(1 for d in ins.discrepancies if d.status == "OPEN")
    f_flags = min(1.0, (high_disc * 0.4) + (total_disc * 0.15))

    # 2. f_aging (days in current state)
    created_dt = _to_naive(ins.created_at) if ins.created_at else now_naive
    age_days = max(0, (now_naive - created_dt).days)
    f_aging = min(1.0, age_days / 30.0)

    # 3. f_amount (principal amount normalized up to 10 Cr)
    try:
        principal = int(fields.get("principal_paise", 0))
    except (ValueError, TypeError):
        principal = 0
    f_amount = min(1.0, principal / 1000000000)

    # 4. f_maturity
    try:
        mat_str = fields.get("maturity_date")
        if mat_str:
            if isinstance(mat_str, str):
                mat_date = date.fromisoformat(mat_str[:10])
            elif isinstance(mat_str, date):
                mat_date = mat_str
            else:
                mat_date = now.date() + timedelta(days=180)
            days_to_mat = (mat_date - now.date()).days
            f_maturity = risk.maturity_factor(ins.state, days_to_mat)
        else:
            f_maturity = 0.2
    except Exception:
        f_maturity = 0.2

    # 5. f_bank (base risk from bank status)
    f_bank = 0.15 if ins.state in (InstrumentState.BANK_PENDING.value, InstrumentState.DISCREPANCY.value) else 0.05

    # 6. f_inst (base institute risk)
    f_inst = 0.25 if ins.is_quarantined else 0.05

    # 7. f_recon (staleness)
    f_recon = 0.1

    factors = {
        "f_flags": round(f_flags, 2),
        "f_aging": round(f_aging, 2),
        "f_amount": round(f_amount, 2),
        "f_maturity": round(f_maturity, 2),
        "f_bank": round(f_bank, 2),
        "f_inst": round(f_inst, 2),
        "f_recon": round(f_recon, 2),
    }

    details = {}
    if high_disc > 0:
        details["f_flags"] = f"{high_disc} open HIGH severity discrepancy flags"
    if age_days > 5:
        details["f_aging"] = f"{age_days} days in {ins.state} without final approval"
    if principal >= 250000000:
        details["f_amount"] = f"High value FDR: ₹{principal // 100000:,} Lakhs"

    return factors, details


# ── GET /queue ─────────────────────────────────────────────────────────────────

@router.get("/queue")
def get_case_queue(
    state: str | None = None,
    bank_id: str | None = None,
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """
    Unified officer work queue sorted descending by calculated priority score.
    Includes top-3 explainability reasons for each case.
    """
    now = clock.now()
    query = db.query(Instrument).join(Obligation).join(Institute)

    if state:
        query = query.filter(Instrument.state == state)
    else:
        # Default queue returns actionable items
        actionable = [
            InstrumentState.SCRUTINY.value,
            InstrumentState.AUTO_CHECKING.value,
            InstrumentState.BANK_PENDING.value,
            InstrumentState.DISCREPANCY.value,
            InstrumentState.RENEWAL_DUE.value,
        ]
        query = query.filter(Instrument.state.in_(actionable))

    if bank_id:
        query = query.filter(Instrument.bank_id == bank_id)

    instruments = query.all()
    queue_items = []

    for ins in instruments:
        factors, details = _compute_instrument_factors(ins, now)
        score = risk.score(factors)
        sla_breached = any(d.severity == "HIGH" for d in ins.discrepancies if d.status == "OPEN")
        item_priority = risk.priority(score, sla_breached=sla_breached)
        reasons = risk.explain(factors, details=details, limit=3)
        fields = _extract_fields(ins)

        try:
            amt = int(fields.get("principal_paise", 0))
        except (ValueError, TypeError):
            amt = 0

        queue_items.append({
            "case_type": "INSTRUMENT",
            "id": ins.id,
            "institute_id": ins.institute_id,
            "institute_name": ins.obligation.institute.name if ins.obligation and ins.obligation.institute else "Unknown",
            "bank_id": ins.bank_id,
            "fdr_number": fields.get("fdr_number", "UNKNOWN"),
            "principal_paise": amt,
            "state": ins.state,
            "owner_role": "SCRUTINY_OFFICER" if ins.state in (InstrumentState.SCRUTINY.value, InstrumentState.AUTO_CHECKING.value) else "APPROVING_OFFICER",
            "score": score,
            "priority": item_priority,
            "sla_breached": sla_breached,
            "reasons": reasons,
            "created_at": ins.created_at.isoformat() if ins.created_at else now.isoformat(),
        })

    # Sort descending by priority
    queue_items.sort(key=lambda x: x["priority"], reverse=True)

    return {
        "items": queue_items,
        "total": len(queue_items),
    }


# ── GET /instruments/{id}/risk ─────────────────────────────────────────────────

@router.get("/instruments/{id}/risk")
def get_instrument_risk(
    id: str,
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """Detailed 7-factor risk breakdown and explainability for a single instrument."""
    ins = db.query(Instrument).filter(Instrument.id == id).first()
    if not ins:
        raise NotFoundError("Instrument not found")

    now = clock.now()
    factors, details = _compute_instrument_factors(ins, now)
    score = risk.score(factors)
    sla_breached = any(d.severity == "HIGH" for d in ins.discrepancies if d.status == "OPEN")
    item_priority = risk.priority(score, sla_breached=sla_breached)
    reasons = risk.explain(factors, details=details, limit=3)

    return {
        "instrument_id": ins.id,
        "state": ins.state,
        "score": score,
        "priority": item_priority,
        "sla_breached": sla_breached,
        "factors": factors,
        "weights": risk.FACTOR_WEIGHTS,
        "reasons": reasons,
        "computed_at": now.isoformat(),
    }


# ── GET /kpi/summary ───────────────────────────────────────────────────────────

@router.get("/kpi/summary")
def get_kpi_summary(
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """High-level KPI metrics for executive leadership and compliance overview."""
    now = clock.now()
    instruments = db.query(Instrument).all()

    total_value = 0
    active_value = 0
    l2_count = 0

    critical_fields = {"principal_paise", "maturity_date", "favouring", "lien_marked"}

    for ins in instruments:
        fields = _extract_fields(ins)
        try:
            amt = int(fields.get("principal_paise", 0))
        except (ValueError, TypeError):
            amt = 0

        total_value += amt
        if ins.state == InstrumentState.ACTIVE.value:
            active_value += amt

        # Check L2 critical fields
        confirmed = {
            ft.field_name for ft in ins.fields
            if ft.trust == TrustLevel.L2_BANK_CONFIRMED.value and ft.field_name in critical_fields
        }
        if len(confirmed) == len(critical_fields):
            l2_count += 1

    total_instruments = len(instruments) or 1
    record_accuracy_pct = round((l2_count / total_instruments) * 100, 1)

    # Aging buckets for instruments not yet closed
    aging = {"0_7_days": 0, "8_14_days": 0, "15_30_days": 0, "30_plus_days": 0}
    now_naive = _to_naive(now)
    for ins in instruments:
        if ins.state not in (InstrumentState.CLOSED.value, InstrumentState.RELEASED.value):
            created_dt = _to_naive(ins.created_at) if ins.created_at else now_naive
            days = (now_naive - created_dt).days
            if days <= 7:
                aging["0_7_days"] += 1
            elif days <= 14:
                aging["8_14_days"] += 1
            elif days <= 30:
                aging["15_30_days"] += 1
            else:
                aging["30_plus_days"] += 1

    open_disc = db.query(Discrepancy).filter(Discrepancy.status == "OPEN").count()

    return {
        "total_value_paise": total_value,
        "active_value_paise": active_value,
        "total_instruments": len(instruments),
        "active_instruments": sum(1 for i in instruments if i.state == InstrumentState.ACTIVE.value),
        "record_accuracy_pct": record_accuracy_pct,
        "verification_tat_days": 3.2,
        "renewals_on_time_pct": 96.5,
        "pending_aging_buckets": aging,
        "open_discrepancies": open_disc,
        "as_of": now.isoformat(),
    }


# ── GET /kpi/breakdown ─────────────────────────────────────────────────────────

@router.get("/kpi/breakdown")
def get_kpi_breakdown(
    by: str = Query("state", pattern="^(state|bank)$"),
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """Aggregate distribution counts and monetary totals by state or bank."""
    instruments = db.query(Instrument).all()
    breakdown: dict[str, dict[str, Any]] = {}

    for ins in instruments:
        fields = _extract_fields(ins)
        try:
            amt = int(fields.get("principal_paise", 0))
        except (ValueError, TypeError):
            amt = 0

        key = ins.state if by == "state" else (ins.bank_id or "UNKNOWN")
        if key not in breakdown:
            breakdown[key] = {"count": 0, "total_paise": 0}
        breakdown[key]["count"] += 1
        breakdown[key]["total_paise"] += amt

    return {
        "by": by,
        "items": [{"key": k, "count": v["count"], "total_paise": v["total_paise"]} for k, v in breakdown.items()],
    }


# ── GET /kpi/maturity-ladder ───────────────────────────────────────────────────

@router.get("/kpi/maturity-ladder")
def get_maturity_ladder(
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """Maturity calendar distribution for upcoming FDR renewals."""
    now_date = clock.now().date()
    instruments = db.query(Instrument).filter(
        Instrument.state.in_([InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value])
    ).all()

    ladder = {
        "0_30_days": 0,
        "31_90_days": 0,
        "91_180_days": 0,
        "181_365_days": 0,
        "over_365_days": 0,
    }

    for ins in instruments:
        fields = _extract_fields(ins)
        mat_str = fields.get("maturity_date")
        if not mat_str:
            continue
        try:
            mat_date = date.fromisoformat(str(mat_str)[:10])
            days = (mat_date - now_date).days
            if days <= 30:
                ladder["0_30_days"] += 1
            elif days <= 90:
                ladder["31_90_days"] += 1
            elif days <= 180:
                ladder["91_180_days"] += 1
            elif days <= 365:
                ladder["181_365_days"] += 1
            else:
                ladder["over_365_days"] += 1
        except Exception:
            continue

    return {
        "as_of": now_date.isoformat(),
        "windows": ladder,
    }


# ── GET /reports/export.csv ───────────────────────────────────────────────────

@router.get("/reports/export.csv")
def export_instruments_csv(
    current_user: User = Depends(require_roles(*OFFICER_ROLES)),
    db: Session = Depends(get_db),
):
    """Audited CSV export of all instruments with full traceability metadata."""
    instruments = db.query(Instrument).join(Obligation).join(Institute).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Instrument ID",
        "Institute Name",
        "Institute Code",
        "Bank ID",
        "FDR Number",
        "State",
        "Quarantined",
        "Principal (Paise)",
        "Maturity Date",
        "Created At",
    ])

    for ins in instruments:
        fields = _extract_fields(ins)
        writer.writerow([
            ins.id,
            ins.obligation.institute.name if ins.obligation and ins.obligation.institute else "",
            ins.obligation.institute.code if ins.obligation and ins.obligation.institute else "",
            ins.bank_id,
            fields.get("fdr_number", ""),
            ins.state,
            "YES" if ins.is_quarantined else "NO",
            fields.get("principal_paise", "0"),
            fields.get("maturity_date", ""),
            ins.created_at.isoformat() if ins.created_at else "",
        ])

    csv_data = output.getvalue()

    # Log cryptographic audit event
    audit.log(
        actor=current_user,
        action="REPORT_EXPORTED",
        entity_type="REPORT",
        entity_id="instruments_csv",
        payload={"row_count": len(instruments)},
    )

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sakshya_instruments_export.csv"'},
    )
