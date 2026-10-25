"""Bank verification request operations and confirmation lookups."""
from uuid import uuid4

from app.core import audit, clock, notify
from app.core.db import SessionLocal
from app.core.enums import BankRequestState, InstrumentState, Role
from app.core.errors import InvalidStateError, NotFoundError, ValidationError
from app.modules.bank.models import BankChecklistItem, BankNodalContact, BankRequest
from app.modules.intake import service as intake_service

_OPEN_STATES = (
    BankRequestState.CREATED.value,
    BankRequestState.NOTIFIED.value,
    BankRequestState.ACKNOWLEDGED.value,
    BankRequestState.MAKER_SUBMITTED.value,
)
_CHECKLIST_QUESTIONS = (
    "Is the FDR number genuine and present in CBS?",
    "Does the principal amount match CBS records?",
    "Is the maturity date consistent with CBS?",
    "Is the FDR issued in favour of Member Secretary, AICTE?",
    "Is the lien marked in favour of AICTE on CBS?",
    "Is the interest rate consistent with the bank rate card?",
    "Do holder names match trust registration?",
    "Is the issuing branch verified and active?",
    "Has the FDR been checked against the physical register?",
    "Is the certificate serial number authentic?",
    "Are there prior claims or encumbrances?",
    "Has the document been authenticated by a branch manager?",
)


def create_request(instrument_id: str, actor, reason: str) -> BankRequest:
    """Create, notify, and persist a directory-routed bank request."""
    if not reason or not reason.strip():
        raise ValidationError("A bank request reason is required")
    db = SessionLocal()
    try:
        instrument = intake_service.get_instrument(instrument_id, db)
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        allowed_states = {
            InstrumentState.SCRUTINY.value,
            InstrumentState.BANK_PENDING.value,
            InstrumentState.DISCREPANCY.value,
        }
        if instrument.state not in allowed_states:
            raise InvalidStateError(f"Cannot request bank verification from {instrument.state} state")
        existing = db.query(BankRequest.id).filter(
            BankRequest.instrument_id == instrument.id,
            BankRequest.state.in_(_OPEN_STATES),
        ).first()
        if existing:
            raise InvalidStateError("An open bank request already exists for this instrument")
        contact = db.query(BankNodalContact).filter(
            BankNodalContact.bank_id == instrument.bank_id,
        ).order_by(BankNodalContact.id).first()
        if not contact:
            raise NotFoundError("Bank nodal contact", instrument.bank_id)

        now = clock.now()
        request = BankRequest(
            id=str(uuid4()), instrument_id=instrument.id, bank_id=instrument.bank_id,
            state=BankRequestState.CREATED.value, outcome=None, reason=reason.strip(),
            directory_contact_id=contact.id, created_by=actor.id, created_at=now,
        )
        db.add(request)
        db.flush()
        for item_no, question in enumerate(_CHECKLIST_QUESTIONS, start=1):
            db.add(BankChecklistItem(
                id=str(uuid4()), request_id=request.id, item_no=item_no,
                question=question, answer=None,
            ))
        audit.log(
            actor=actor, action="BANK_REQUEST_CREATED", entity_type="BANK_REQUEST",
            entity_id=request.id, payload={"instrument_id": instrument.id, "bank_id": instrument.bank_id,
                                           "directory_contact_id": contact.id, "reason": reason.strip()}, db=db,
        )
        request.state = BankRequestState.NOTIFIED.value
        request.notified_at = now
        if Role.SCRUTINY_OFFICER.value in actor.roles and not instrument.scrutiny_officer_id:
            intake_service.assign_scrutiny_officer(instrument.id, actor.id, db)
        if instrument.state == InstrumentState.SCRUTINY.value:
            intake_service.transition(instrument.id, InstrumentState.BANK_PENDING, actor,
                                      "Bank verification requested", db)
        notify.send(
            title="New FDR verification request",
            body=f"A verification request is ready for bank {instrument.bank_id}.",
            role=Role.BANK_MAKER, bank_id=instrument.bank_id, level="INFO",
            link=f"/bank/requests/{request.id}", dedupe_key=f"bank-request:{request.id}:notified", db=db,
        )
        audit.log(
            actor=actor, action="BANK_REQUEST_NOTIFIED", entity_type="BANK_REQUEST",
            entity_id=request.id, payload={"bank_id": instrument.bank_id,
                                           "directory_contact_id": contact.id}, db=db,
        )
        db.commit()
        db.refresh(request)
        return request
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def latest_confirmation(instrument_id: str) -> dict | None:
    """Return the most recent confirmed bank request for an instrument."""
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter(
            BankRequest.instrument_id == instrument_id,
            BankRequest.state.in_(
                (BankRequestState.CONFIRMED.value, BankRequestState.CONFIRMED_WITH_EXCEPTIONS.value),
            ),
        ).order_by(BankRequest.responded_at.desc(), BankRequest.created_at.desc()).first()
        if not request:
            return None
        return {"confirmed_at": request.responded_at, "outcome": request.outcome}
    finally:
        db.close()


def receive_response_from_contact(request_id: str, contact_email: str, payload: dict) -> dict:
    """Accept only responses from a bank's directory contacts; flag spoofed senders."""
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter(BankRequest.id == request_id).first()
        if not request:
            raise NotFoundError("Bank request", request_id)
        valid_contact = db.query(BankNodalContact.id).filter(
            BankNodalContact.bank_id == request.bank_id,
            BankNodalContact.email.ilike(contact_email.strip()),
        ).first()
        if valid_contact:
            audit.log(actor="SYSTEM", action="BANK_CONTACT_RESPONSE_RECEIVED", entity_type="BANK_REQUEST",
                      entity_id=request.id, payload={"contact_email": contact_email}, db=db)
            db.commit()
            return {"rejected": False}
        intake_service.add_discrepancy(
            request.instrument_id, "D-13", "HIGH",
            {"contact_email": contact_email, "security_alert": True}, db,
        )
        notify.send(title="Rejected bank response from unknown contact",
                    body=f"Request {request.id} received a response from {contact_email}.",
                    role=Role.COMPLIANCE_OFFICER, level="HIGH", link=f"/bank-requests/{request.id}", db=db)
        audit.log(actor="SYSTEM", action="BANK_CONTACT_RESPONSE_REJECTED", entity_type="BANK_REQUEST",
                  entity_id=request.id, payload={"contact_email": contact_email, "payload_ignored": True}, db=db)
        db.commit()
        return {"rejected": True}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# Importing the bank service also registers the bank SLA job with the central runner.
from app.modules.bank import sla as _sla  # noqa: F401
