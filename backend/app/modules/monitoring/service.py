"""
Monitoring module service: maturity scanning, alert ladder, and lapse detection (§7.8, SEQ-11).
"""
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core import audit, clock, notify, policy
from app.core.enums import AlertType, InstrumentState, Role, Severity
from app.modules.intake import service as intake_svc
from app.modules.intake.models import Instrument
from app.modules.monitoring.models import Alert


def scan_maturities(db: Session, now_dt: datetime) -> dict[str, Any]:
    """
    Scan all active and renewal-due instruments against maturity windows and lapse thresholds.

    Executed on periodic ticks (/api/admin/tick or /api/admin/clock/advance).
    Idempotent: deduplicated via unique alert and notification keys.
    """
    today = now_dt.date()
    windows: list[int] = sorted(policy.get("maturity_alert_days", [180, 90, 30, 7]), reverse=True)
    lapse_escalation_days: int = policy.get("lapse_escalation_days", 15)

    # Scannable instruments: ACTIVE, RENEWAL_DUE, or LAPSED (to evaluate lapse escalation)
    scannable_states = [
        InstrumentState.ACTIVE.value,
        InstrumentState.RENEWAL_DUE.value,
        InstrumentState.LAPSED.value,
    ]

    instruments = (
        db.query(Instrument)
        .filter(Instrument.state.in_(scannable_states))
        .all()
    )

    scanned_count = len(instruments)
    alerts_created = 0
    transitions = {"RENEWAL_DUE": 0, "LAPSED": 0, "MATURED": 0, "LAPSE_ESCALATED": 0}

    for ins in instruments:
        raw_mat = intake_svc.get_field_value(ins, "maturity_date", db)
        maturity_date = intake_svc.parse_date(raw_mat)
        if not maturity_date:
            continue

        fdr_number = intake_svc.get_field_value(ins, "fdr_number", db) or ins.id
        institute_name = ins.obligation.institute.name if ins.obligation and ins.obligation.institute else "Unknown Institute"
        days_remaining = (maturity_date - today).days

        # ── 1. Term Complete & Matured ─────────────────────────────────────────
        if (
            ins.obligation
            and ins.obligation.end_date <= today
            and days_remaining <= 0
            and ins.state in (InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value)
        ):
            intake_svc.transition(
                instrument_id=ins.id,
                to_state=InstrumentState.MATURED.value,
                actor="SYSTEM",
                reason="Obligation term completed and instrument maturity reached",
                db=db,
            )
            intake_svc.recompute_coverage(ins.obligation_id, db=db)
            transitions["MATURED"] += 1
            continue

        # ── 2. Lapse Detection (days < 0) ──────────────────────────────────────
        if days_remaining < 0 and ins.state in (InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value):
            # Transition to LAPSED
            intake_svc.transition(
                instrument_id=ins.id,
                to_state=InstrumentState.LAPSED.value,
                actor="SYSTEM",
                reason=f"FDR past maturity by {abs(days_remaining)} days without accepted renewal",
                db=db,
            )
            transitions["LAPSED"] += 1

            # Create LAPSED alert
            lapsed_dedupe = f"alert:{ins.id}:LAPSED"
            existing_alert = db.query(Alert).filter(Alert.dedupe_key == lapsed_dedupe).first()
            if not existing_alert:
                alert = Alert(
                    id=str(uuid4()),
                    instrument_id=ins.id,
                    obligation_id=ins.obligation_id,
                    institute_id=ins.institute_id,
                    institute_name=institute_name,
                    fdr_number=fdr_number,
                    alert_type=AlertType.LAPSED.value,
                    window_days=days_remaining,
                    severity=Severity.HIGH.value,
                    title=f"FDR LAPSED: {fdr_number} ({institute_name})",
                    message=f"Instrument {fdr_number} matured on {maturity_date} and has passed maturity without renewal. Breach case opened.",
                    maturity_date=maturity_date,
                    dedupe_key=lapsed_dedupe,
                    is_resolved=False,
                    created_at=now_dt,
                )
                db.add(alert)
                alerts_created += 1

            # Dispatch breach notifications (§7.8: Institute, SO, AO)
            notify.send(
                title=f"Breach Notice: Instrument {fdr_number} Lapsed",
                body=f"Instrument {fdr_number} has lapsed without accepted renewal. Immediate rectification required.",
                institute_id=ins.institute_id,
                role=Role.INS_SIGNATORY,
                level="ERROR",
                dedupe_key=f"notif:{ins.id}:LAPSED:inst",
                db=db,
            )
            notify.send(
                title=f"Breach Case: Instrument {fdr_number} Lapsed",
                body=f"{institute_name} FDR {fdr_number} lapsed on {maturity_date}.",
                role=Role.SCRUTINY_OFFICER,
                level="ERROR",
                dedupe_key=f"notif:{ins.id}:LAPSED:so",
                db=db,
            )
            notify.send(
                title=f"Breach Case Assigned: {fdr_number}",
                body=f"{institute_name} FDR {fdr_number} lapsed on {maturity_date}. Case assigned for action.",
                role=Role.APPROVING_OFFICER,
                level="ERROR",
                dedupe_key=f"notif:{ins.id}:LAPSED:ao",
                db=db,
            )

            # Recompute coverage on lapse breach
            intake_svc.recompute_coverage(ins.obligation_id, db=db)

        # ── 3. Lapse Escalation (days <= -lapse_escalation_days) ────────────────
        if ins.state == InstrumentState.LAPSED.value and abs(days_remaining) >= lapse_escalation_days:
            escalate_dedupe = f"alert:{ins.id}:LAPSE_ESCALATED"
            existing_esc = db.query(Alert).filter(Alert.dedupe_key == escalate_dedupe).first()
            if not existing_esc:
                alert = Alert(
                    id=str(uuid4()),
                    instrument_id=ins.id,
                    obligation_id=ins.obligation_id,
                    institute_id=ins.institute_id,
                    institute_name=institute_name,
                    fdr_number=fdr_number,
                    alert_type=AlertType.LAPSE_ESCALATED.value,
                    window_days=days_remaining,
                    severity=Severity.HIGH.value,
                    title=f"BREACH ESCALATED: {fdr_number} Overdue {abs(days_remaining)} Days",
                    message=f"Instrument {fdr_number} has remained in LAPSED status for more than {lapse_escalation_days} days. Escalate to Release Authority.",
                    maturity_date=maturity_date,
                    dedupe_key=escalate_dedupe,
                    is_resolved=False,
                    created_at=now_dt,
                )
                db.add(alert)
                alerts_created += 1
                transitions["LAPSE_ESCALATED"] += 1

                notify.send(
                    title=f"Unresolved Breach Escalation: {fdr_number}",
                    body=f"{institute_name} FDR {fdr_number} lapsed {abs(days_remaining)} days ago and remains unrenewed.",
                    role=Role.RELEASE_AUTHORITY,
                    level="ERROR",
                    dedupe_key=f"notif:{ins.id}:LAPSE_ESCALATED:ra",
                    db=db,
                )
                notify.send(
                    title=f"Regulatory Alert: FDR Lapsed >{lapse_escalation_days} Days",
                    body=f"{institute_name} FDR {fdr_number} has remained lapsed for {abs(days_remaining)} days.",
                    role=Role.LEADERSHIP,
                    level="ERROR",
                    dedupe_key=f"notif:{ins.id}:LAPSE_ESCALATED:lead",
                    db=db,
                )
                audit.log(
                    actor="SYSTEM",
                    action="LAPSE_ESCALATED",
                    entity_type="INSTRUMENT",
                    entity_id=ins.id,
                    payload={"days_overdue": abs(days_remaining), "fdr_number": fdr_number},
                    db=db,
                )

        # ── 4. Maturity Windows Ladder (180, 90, 30, 7) ────────────────────────
        if days_remaining >= 0 and ins.state in (InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value):
            for window in windows:
                if days_remaining <= window:
                    window_dedupe = f"alert:{ins.id}:{window}"
                    existing_window = db.query(Alert).filter(Alert.dedupe_key == window_dedupe).first()
                    if not existing_window:
                        # Determine severity and alert type
                        if window >= 180:
                            alert_type = AlertType.MATURITY_180.value
                            severity = Severity.LOW.value
                        elif window >= 90:
                            alert_type = AlertType.MATURITY_90.value
                            severity = Severity.MEDIUM.value
                        elif window >= 30:
                            alert_type = AlertType.MATURITY_30.value
                            severity = Severity.HIGH.value
                        else:
                            alert_type = AlertType.MATURITY_7.value
                            severity = Severity.HIGH.value

                        alert = Alert(
                            id=str(uuid4()),
                            instrument_id=ins.id,
                            obligation_id=ins.obligation_id,
                            institute_id=ins.institute_id,
                            institute_name=institute_name,
                            fdr_number=fdr_number,
                            alert_type=alert_type,
                            window_days=window,
                            severity=severity,
                            title=f"Maturity Alert ({window} Days): {fdr_number}",
                            message=f"Instrument {fdr_number} matures on {maturity_date} ({days_remaining} days remaining). Renewal window is active.",
                            maturity_date=maturity_date,
                            dedupe_key=window_dedupe,
                            is_resolved=False,
                            created_at=now_dt,
                        )
                        db.add(alert)
                        alerts_created += 1

                        # Escalation notification ladder (§7.8)
                        # All windows -> Institute Signatory
                        notify.send(
                            title=f"Maturity Alert ({window}d): {fdr_number}",
                            body=f"Instrument {fdr_number} matures on {maturity_date} ({days_remaining} days remaining).",
                            institute_id=ins.institute_id,
                            role=Role.INS_SIGNATORY,
                            level="INFO" if window >= 90 else "WARNING",
                            dedupe_key=f"notif:{ins.id}:{window}:inst",
                            db=db,
                        )

                        # <= 30d -> Scrutiny Officer
                        if window <= 30:
                            notify.send(
                                title=f"Urgent Maturity Alert ({window}d): {fdr_number}",
                                body=f"{institute_name} instrument {fdr_number} matures in {days_remaining} days.",
                                role=Role.SCRUTINY_OFFICER,
                                level="WARNING",
                                dedupe_key=f"notif:{ins.id}:{window}:so",
                                db=db,
                            )

                        # <= 7d -> Approving Officer
                        if window <= 7:
                            notify.send(
                                title=f"Imminent Maturity Alert (7d): {fdr_number}",
                                body=f"{institute_name} instrument {fdr_number} matures in {days_remaining} days on {maturity_date}.",
                                role=Role.APPROVING_OFFICER,
                                level="ERROR",
                                dedupe_key=f"notif:{ins.id}:{window}:ao",
                                db=db,
                            )

                    # Transition ACTIVE -> RENEWAL_DUE when entering window <= 180
                    if window == 180 and ins.state == InstrumentState.ACTIVE.value:
                        intake_svc.transition(
                            instrument_id=ins.id,
                            to_state=InstrumentState.RENEWAL_DUE.value,
                            actor="SYSTEM",
                            reason=f"Entered renewal due window ({days_remaining} days remaining to maturity)",
                            db=db,
                        )
                        transitions["RENEWAL_DUE"] += 1

    db.flush()
    return {
        "scanned_instruments": scanned_count,
        "alerts_created": alerts_created,
        "transitions": transitions,
    }

