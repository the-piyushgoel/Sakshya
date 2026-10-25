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
import math
from statistics import median
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core import audit, clock, jobs, policy
from app.core.db import get_db
from app.core.deps import require_roles
from app.core.enums import InstrumentState, Role, TrustLevel
from app.core.errors import NotFoundError
from app.core.models import AuditEvent, JobRun, User
from app.modules.bank.models import Bank, BankRequest
from app.modules.insights import risk
from app.modules.insights.models import RiskScore
from app.modules.intake.models import Discrepancy, Institute, Instrument, Obligation
from app.modules.release.models import ReleaseRequest

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
_CRITICAL_FIELDS = {"principal_paise", "maturity_date", "favouring", "lien_marked"}
_TAMPER_CODES = {"D-10", "D-12"}


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
    open_discrepancies = [d for d in ins.discrepancies if d.status == "OPEN"]
    high_disc = sum(1 for d in open_discrepancies if d.severity == "HIGH")
    flag_points = sum(
        {"HIGH": 3.0, "MEDIUM": 1.5, "LOW": 0.5}.get(d.severity, 0.0)
        + (1.0 if d.code in _TAMPER_CODES else 0.0)
        for d in open_discrepancies
    )
    f_flags = min(1.0, flag_points / 6.0)

    # 2. f_aging (days in current state)
    state_since = max(
        (_to_naive(item.at) for item in ins.history if item.to_state == ins.state),
        default=_to_naive(ins.created_at) if ins.created_at else now_naive,
    )
    age_days = max(0, (now_naive - state_since).days)
    f_aging = min(1.0, age_days / 60.0)

    # 3. f_amount (principal amount normalized up to 10 Cr)
    try:
        principal = int(fields.get("principal_paise", 0))
    except (ValueError, TypeError):
        principal = 0
    active_amounts = getattr(ins, "_active_amounts", ())
    f_amount = (
        sum(1 for amount in active_amounts if amount <= principal) / len(active_amounts)
        if active_amounts else 0.0
    )

    # 4. f_maturity
    mat_str = fields.get("maturity_date")
    try:
        mat_date = date.fromisoformat(str(mat_str)[:10]) if mat_str else None
    except ValueError:
        mat_date = None
    f_maturity = (
        risk.maturity_factor(ins.state, (mat_date - now.date()).days)
        if mat_date else risk.maturity_factor(ins.state, None) if ins.state == InstrumentState.LAPSED.value else 0.0
    )

    # 5. f_bank (base risk from bank status)
    bank_requests = getattr(ins, "bank_requests", ())
    response_delays = [
        max(0, (_to_naive(req.responded_at) - _to_naive(req.created_at)).days)
        for req in bank_requests if req.responded_at is not None
    ]
    timeout_days = max(1, int(policy.get("bank_request_timeout_days", 30)))
    f_bank = min(1.0, median(response_delays) / timeout_days) if response_delays else (
        1.0 if ins.state == InstrumentState.BANK_PENDING.value and age_days >= timeout_days else
        min(1.0, age_days / timeout_days) if ins.state == InstrumentState.BANK_PENDING.value else 0.0
    )

    # 6. f_inst (base institute risk)
    institute_instruments = getattr(ins, "_institute_instruments", ())
    history_events = sum(
        1 for item in institute_instruments
        if item.is_quarantined or item.state == InstrumentState.LAPSED.value
    )
    institute_disc = sum(
        1 for item in institute_instruments for discrepancy in item.discrepancies
        if discrepancy.status == "OPEN"
    )
    f_inst = min(1.0, (history_events * 0.25) + (institute_disc * 0.1))

    # 7. f_recon (staleness)
    confirmations = [
        _to_naive(req.responded_at)
        for req in bank_requests
        if req.responded_at is not None and req.state in {"CONFIRMED", "CONFIRMED_WITH_EXCEPTIONS"}
    ]
    cadence_days = 90
    if confirmations:
        stale_days = max(0, (now_naive - max(confirmations)).days)
        f_recon = min(1.0, stale_days / cadence_days)
    else:
        f_recon = 1.0

    factors = {
        "f_flags": round(f_flags, 2),
        "f_aging": round(f_aging, 2),
        "f_amount": round(f_amount, 2),
        "f_maturity": round(f_maturity, 2),
        "f_bank": round(f_bank, 2),
        "f_inst": round(f_inst, 2),
        "f_recon": round(f_recon, 2),
    }

    details: dict[str, str] = {}
    if high_disc > 0:
        details["f_flags"] = f"{high_disc} open HIGH severity discrepancy flags"
    if age_days > 5:
        details["f_aging"] = f"{age_days} days in {ins.state} without final approval"
    if principal >= 250000000:
        details["f_amount"] = f"High-value FDR: ₹{principal // 100000:,} lakhs"
    if f_maturity >= 1 and ins.state == InstrumentState.LAPSED.value:
        details["f_maturity"] = "Instrument has lapsed"
    elif mat_date is not None:
        days_to_maturity = (mat_date - now.date()).days
        if days_to_maturity <= 180:
            details["f_maturity"] = f"Maturity in {max(days_to_maturity, 0)} days"
    if f_bank > 0:
        details["f_bank"] = f"Bank response risk {f_bank:.0%}"
    if f_recon > 0:
        details["f_recon"] = f"Bank confirmation is {f_recon:.0%} stale"

    return factors, details


def _instrument_amount(ins: Instrument) -> int:
    value = _extract_fields(ins).get("principal_paise", 0)
    try:
        amount = int(value)
    except (ValueError, TypeError):
        return 0
    return max(0, amount)


def _prepare_instruments(db: Session, instruments: list[Instrument]) -> None:
    instrument_ids = {item.id for item in instruments}
    active_amounts = sorted(
        _instrument_amount(item)
        for item in db.query(Instrument).filter(Instrument.state == InstrumentState.ACTIVE.value).all()
    )
    institute_ids = {item.institute_id for item in instruments}
    requests_by_instrument: dict[str, list[BankRequest]] = {}
    if instrument_ids:
        for request in db.query(BankRequest).filter(BankRequest.instrument_id.in_(instrument_ids)).all():
            requests_by_instrument.setdefault(request.instrument_id, []).append(request)
    institute_instruments: dict[str, list[Instrument]] = {}
    for institute_id in institute_ids:
        institute_instruments[institute_id] = db.query(Instrument).filter(
            Instrument.institute_id == institute_id,
        ).all()
    for item in instruments:
        item._active_amounts = active_amounts
        item._institute_instruments = institute_instruments.get(item.institute_id, [])
        item.bank_requests = sorted(
            requests_by_instrument.get(item.id, []),
            key=lambda request: request.created_at,
        )


def _risk_weights() -> dict[str, float]:
    weights = policy.get("risk_weights", risk.FACTOR_WEIGHTS)
    return weights if isinstance(weights, dict) else risk.FACTOR_WEIGHTS


def rescore_all(db: Session, now_dt: datetime) -> dict[str, int]:
    """Recompute and persist one risk snapshot for every instrument."""
    instruments = db.query(Instrument).all()
    _prepare_instruments(db, instruments)
    weights = _risk_weights()
    for instrument in instruments:
        factors, _ = _compute_instrument_factors(instrument, now_dt)
        calculated = risk.score(factors, weights)
        snapshot = db.query(RiskScore).filter(RiskScore.instrument_id == instrument.id).first()
        if snapshot is None:
            snapshot = RiskScore(instrument_id=instrument.id, score=calculated, factors_json=factors, computed_at=now_dt)
            db.add(snapshot)
        else:
            snapshot.score = calculated
            snapshot.factors_json = factors
            snapshot.computed_at = now_dt
    return {"rescored": len(instruments)}


jobs.register("insights_rescore_all", rescore_all)


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
    _prepare_instruments(db, instruments)
    queue_items = []
    weights = _risk_weights()

    for ins in instruments:
        factors, details = _compute_instrument_factors(ins, now)
        score = risk.score(factors, weights)
        sla_breached = any(d.severity == "HIGH" for d in ins.discrepancies if d.status == "OPEN")
        open_request = next(
            (request for request in reversed(ins.bank_requests)
             if request.state in {"CREATED", "NOTIFIED", "ACKNOWLEDGED", "MAKER_SUBMITTED", "ESCALATED"}),
            None,
        )
        sla_due = None
        due_in_days = None
        if open_request:
            timeout_days = int(policy.get("bank_request_timeout_days", 30))
            due_at = _to_naive(open_request.created_at) + timedelta(days=timeout_days)
            sla_due = due_at.isoformat()
            due_in_days = (due_at.date() - now.date()).days
            sla_breached = sla_breached or due_in_days < 0
        item_priority = risk.priority(score, sla_breached=sla_breached, due_in_days=due_in_days)
        reasons = risk.explain(factors, details=details, limit=3)
        fields = _extract_fields(ins)

        amount = _instrument_amount(ins)
        bank = db.query(Bank).filter(Bank.id == ins.bank_id).first()
        age_days = max(0, (now.date() - _to_naive(ins.created_at).date()).days)

        queue_items.append({
            "case_type": "INSTRUMENT",
            "id": ins.id,
            "institute": ins.obligation.institute.name if ins.obligation and ins.obligation.institute else "Unknown",
            "institute_id": ins.institute_id,
            "institute_name": ins.obligation.institute.name if ins.obligation and ins.obligation.institute else "Unknown",
            "bank_id": ins.bank_id,
            "bank": bank.name if bank else ins.bank_id,
            "fdr_number": fields.get("fdr_number", "UNKNOWN"),
            "amount": amount,
            "principal_paise": amount,
            "state": ins.state,
            "owner_role": "SCRUTINY_OFFICER" if ins.state in (InstrumentState.SCRUTINY.value, InstrumentState.AUTO_CHECKING.value) else "APPROVING_OFFICER",
            "score": score,
            "priority": item_priority,
            "sla_breached": sla_breached,
            "sla_due": sla_due,
            "age_days": age_days,
            "reasons": reasons,
            "created_at": ins.created_at.isoformat() if ins.created_at else now.isoformat(),
        })

    release_states = ["SUBMITTED", "INELIGIBLE", "SCRUTINY"]
    release_query = db.query(ReleaseRequest)
    if state:
        release_query = release_query.filter(ReleaseRequest.state == state)
    else:
        release_query = release_query.filter(ReleaseRequest.state.in_(release_states))

    active_amounts = sorted(
        _instrument_amount(item)
        for item in db.query(Instrument).filter(Instrument.state == InstrumentState.ACTIVE.value).all()
    )
    for request in release_query.all():
        request_instruments = db.query(Instrument).filter(
            Instrument.id.in_(request.instrument_ids_json or []),
        ).all() if request.instrument_ids_json else []
        request_bank_id = request_instruments[0].bank_id if request_instruments else None
        if bank_id and request_bank_id != bank_id:
            continue

        institute = db.query(Institute).filter(Institute.id == request.institute_id).first()
        bank = db.query(Bank).filter(Bank.id == request_bank_id).first() if request_bank_id else None
        age_days = max(0, (now.date() - _to_naive(request.created_at).date()).days)
        timeout_days = int(policy.get("release_review_timeout_days", 7))
        due_at = _to_naive(request.created_at) + timedelta(days=timeout_days)
        due_in_days = (due_at.date() - now.date()).days
        sla_breached = due_in_days < 0

        failed_rules = [rule for rule in request.rules if rule.result in {"FAIL", "MANUAL"}]
        warned_rules = [rule for rule in request.rules if rule.result == "WARN"]
        f_flags = min(1.0, len(failed_rules) * 0.5 + len(warned_rules) * 0.1)
        f_amount = (
            sum(1 for amount in active_amounts if amount <= request.total_amount_paise) / len(active_amounts)
            if active_amounts else min(1.0, request.total_amount_paise / 1_000_000_000)
        )
        factors = {
            "f_flags": f_flags,
            "f_aging": min(1.0, age_days / 60.0),
            "f_amount": f_amount,
            "f_maturity": 0.0,
            "f_bank": 0.0,
            "f_inst": 0.0,
            "f_recon": 0.0,
        }
        details: dict[str, str] = {}
        if failed_rules:
            details["f_flags"] = "Eligibility review required: " + ", ".join(rule.rule_id for rule in failed_rules)
        elif warned_rules:
            details["f_flags"] = "Eligibility warnings: " + ", ".join(rule.rule_id for rule in warned_rules)
        if age_days > 0:
            details["f_aging"] = f"Release request pending for {age_days} days"
        if request.total_amount_paise >= 250_000_000:
            details["f_amount"] = f"High-value release: ₹{request.total_amount_paise // 100:,}"

        score = risk.score(factors, weights)
        priority = risk.priority(score, sla_breached=sla_breached, due_in_days=due_in_days)
        queue_items.append({
            "case_type": "RELEASE",
            "id": request.id,
            "institute": institute.name if institute else request.institute_id,
            "institute_id": request.institute_id,
            "institute_name": institute.name if institute else request.institute_id,
            "bank_id": request_bank_id,
            "bank": bank.name if bank else request_bank_id,
            "fdr_number": _extract_fields(request_instruments[0]).get("fdr_number", "UNKNOWN") if request_instruments else "UNKNOWN",
            "amount": request.total_amount_paise,
            "principal_paise": request.total_amount_paise,
            "state": request.state,
            "owner_role": "SCRUTINY_OFFICER" if request.state in {"SUBMITTED", "SCRUTINY"} else "APPROVING_OFFICER",
            "score": score,
            "priority": priority,
            "sla_breached": sla_breached,
            "sla_due": due_at.isoformat(),
            "age_days": age_days,
            "reasons": risk.explain(factors, weights, details=details, limit=3),
            "created_at": request.created_at.isoformat() if request.created_at else now.isoformat(),
        })

    queue_items.sort(key=lambda item: (-item["priority"], -item["age_days"], item["id"]))

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
    _prepare_instruments(db, [ins])
    factors, details = _compute_instrument_factors(ins, now)
    score = risk.score(factors, _risk_weights())
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

    critical_fields = _CRITICAL_FIELDS

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
        if critical_fields.issubset(confirmed):
            l2_count += 1

    total_instruments = len(instruments)
    record_accuracy_pct = round((l2_count / total_instruments) * 100, 1) if total_instruments else 0.0

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

    confirmed_requests = db.query(BankRequest).filter(
        BankRequest.responded_at.isnot(None),
        BankRequest.state.in_(("CONFIRMED", "CONFIRMED_WITH_EXCEPTIONS")),
    ).all()
    verification_durations = [
        max(0.0, (_to_naive(request.responded_at) - _to_naive(request.created_at)).total_seconds() / 86400)
        for request in confirmed_requests
    ]
    verification_tat = round(median(verification_durations), 1) if verification_durations else 0.0
    sorted_durations = sorted(verification_durations)
    p90_index = max(0, math.ceil(len(sorted_durations) * 0.9) - 1)
    verification_p90 = round(sorted_durations[p90_index], 1) if sorted_durations else 0.0

    renewals = [instrument for instrument in instruments if instrument.supersedes_id]
    renewed_on_time = 0
    for renewal in renewals:
        old = db.query(Instrument).filter(Instrument.id == renewal.supersedes_id).first()
        old_maturity = _extract_fields(old).get("maturity_date") if old else None
        try:
            renewed_on_time += int(
                bool(old_maturity)
                and renewal.created_at.date() <= date.fromisoformat(str(old_maturity)[:10])
            )
        except ValueError:
            continue
    renewals_on_time_pct = round(100 * renewed_on_time / len(renewals), 1) if renewals else 0.0
    automated_actions = db.query(JobRun).filter(JobRun.status == "SUCCESS").count()
    open_disc = db.query(Discrepancy).filter(Discrepancy.status == "OPEN").count()
    discrepancy_counts: dict[str, int] = {}
    for code, in db.query(Discrepancy.code).filter(Discrepancy.status == "OPEN").all():
        discrepancy_counts[code] = discrepancy_counts.get(code, 0) + 1

    return {
        "total_value_paise": total_value,
        "active_value_paise": active_value,
        "total_instruments": len(instruments),
        "active_instruments": sum(1 for i in instruments if i.state == InstrumentState.ACTIVE.value),
        "record_accuracy_pct": record_accuracy_pct,
        "verification_tat_days": verification_tat,
        "verification_tat_p90_days": verification_p90,
        "renewals_on_time_pct": renewals_on_time_pct,
        "pending_aging_buckets": aging,
        "automated_actions_count": automated_actions,
        "open_discrepancies": open_disc,
        "discrepancies_by_code": discrepancy_counts,
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
        except ValueError:
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
