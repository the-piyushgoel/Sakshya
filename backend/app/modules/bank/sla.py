"""Scheduled bank request SLA reminders and escalation."""
from datetime import datetime
from typing import Any

from app.core import audit, jobs, notify, policy
from app.core.enums import BankRequestState, Role
from app.modules.bank.models import BankRequest
from app.modules.intake import service as intake_service
from sqlalchemy.orm import Session


def bank_request_sla(db: Session, now_dt: datetime) -> dict[str, Any]:
    """Process every reached checkpoint once for requests still awaiting a bank."""
    reminder_days = sorted({int(day) for day in policy.get("bank_reminder_days", [3, 7, 14], db)})
    escalation_days = sorted({int(day) for day in policy.get("escalation_days", [14, 21], db)})
    timeout_days = int(policy.get("bank_request_timeout_days", 30, db))
    active_states = (BankRequestState.NOTIFIED.value, BankRequestState.ACKNOWLEDGED.value,
                     BankRequestState.ESCALATED.value)
    requests = db.query(BankRequest).filter(BankRequest.state.in_(active_states)).all()
    sent = 0
    timed_out = 0
    for request in requests:
        if not request.notified_at:
            continue
        elapsed = (now_dt.replace(tzinfo=None) - request.notified_at).days
        for day in sorted(set(reminder_days + escalation_days + [timeout_days])):
            if elapsed < day:
                continue
            if day == timeout_days:
                if request.state != BankRequestState.TIMED_OUT.value:
                    previous = request.state
                    request.state = BankRequestState.TIMED_OUT.value
                    audit.log(actor="SYSTEM", action="BANK_REQUEST_TIMED_OUT", entity_type="BANK_REQUEST",
                              entity_id=request.id, payload={"from_state": previous, "to_state": request.state,
                                                             "elapsed_days": elapsed}, db=db)
                    intake_service.add_discrepancy(request.instrument_id, "D-18", "MEDIUM",
                                                   {"bank_request_id": request.id, "elapsed_days": elapsed}, db)
                    notify.send(title="Bank verification request timed out",
                                body=f"Bank request {request.id} timed out.", user_id=request.created_by,
                                level="HIGH", dedupe_key=f"bank_sla:{request.id}:{day}", db=db)
                    notify.send(title="Bank verification request timed out",
                                body=f"Bank request {request.id} timed out.", role=Role.APPROVING_OFFICER,
                                level="HIGH", dedupe_key=f"bank_sla:{request.id}:{day}:ao", db=db)
                    sent += 2
                    timed_out += 1
                break
            if day in reminder_days:
                notify.send(title="Bank verification reminder", body=f"Request {request.id} is awaiting a bank response.",
                            role=Role.BANK_MAKER, bank_id=request.bank_id, level="INFO",
                            link=f"/bank/requests/{request.id}", dedupe_key=f"bank_sla:{request.id}:{day}", db=db)
                sent += 1
            if day in escalation_days:
                escalation_index = escalation_days.index(day)
                if escalation_index == 0:
                    if request.state != BankRequestState.ESCALATED.value:
                        previous = request.state
                        request.state = BankRequestState.ESCALATED.value
                        audit.log(actor="SYSTEM", action="BANK_REQUEST_ESCALATED", entity_type="BANK_REQUEST",
                                  entity_id=request.id, payload={"from_state": previous,
                                                                 "to_state": request.state, "elapsed_days": elapsed}, db=db)
                    notify.send(title="Bank verification escalation", body=f"Request {request.id} needs follow-up.",
                                user_id=request.created_by, level="HIGH", dedupe_key=f"bank_sla:{request.id}:{day}:so", db=db)
                else:
                    notify.send(title="Bank verification escalation", body=f"Request {request.id} remains unanswered.",
                                role=Role.APPROVING_OFFICER, level="HIGH",
                                dedupe_key=f"bank_sla:{request.id}:{day}:ao", db=db)
                sent += 1
    db.flush()
    return {"requests_checked": len(requests), "notifications": sent, "timed_out": timed_out}


def register_jobs() -> None:
    jobs.register("bank_request_sla", bank_request_sla)


register_jobs()
