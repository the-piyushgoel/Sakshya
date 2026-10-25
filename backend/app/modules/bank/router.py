# ruff: noqa: B008
"""
Bank module router — owned by Piyush (Lane B).

Endpoints from §3.5:
  GET  /banks
  GET  /banks/{id}/nodal-contacts
  POST /bank-requests
  GET  /bank-requests
  GET  /bank-requests/{id}
  GET  /bank/inbox
  GET  /bank/requests/{id}
  POST /bank/requests/{id}/maker-submit
  POST /bank/requests/{id}/checker-decision

NOTE: /bank/letters belongs to the release module — do NOT implement here.
"""
from app.core import audit, clock, notify, sod
from app.core.db import SessionLocal
from app.core.deps import require_roles
from app.core.enums import (
    BankOutcome,
    BankRequestState,
    InstrumentState,
    Role,
    TrustLevel,
)
from app.core.errors import InvalidStateError, NotFoundError, ValidationError
from app.core.models import User
from app.modules.bank import service
from app.modules.bank.ids import bank_id, stable_id
from app.modules.bank.models import (
    Bank,
    BankChecklistItem,
    BankNodalContact,
    BankRequest,
)
from app.modules.bank.schemas import (
    BankInboxItem,
    BankInboxResponse,
    BankListResponse,
    BankOut,
    BankRequestCreate,
    BankRequestDetail,
    BankRequestListResponse,
    BankRequestOut,
    CheckerDecisionRequest,
    ChecklistItem,
    DirectoryContact,
    InstrumentSummary,
    MakerSubmitRequest,
    NodalContactListResponse,
    NodalContactOut,
)
from app.modules.intake import service as intake_service
from fastapi import APIRouter, Depends, Query

router = APIRouter(tags=["bank"])

# ── Role groups ────────────────────────────────────────────────────────────────

_AICTE_VIEW_ROLES = [
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.COMPLIANCE_OFFICER,
    Role.LEADERSHIP,
    Role.AUDITOR,
    Role.SYSTEM_ADMIN,
    Role.RELEASE_AUTHORITY,
    Role.FINANCE_OFFICER,
]

_AICTE_WRITE_ROLES = [
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.SYSTEM_ADMIN,
]

_BANK_ROLES = [
    Role.BANK_MAKER,
    Role.BANK_CHECKER,
    Role.SYSTEM_ADMIN,
]

# ── Mock data (one place, reused) ──────────────────────────────────────────────

_OPEN_INBOX_STATES = (
    BankRequestState.NOTIFIED.value,
    BankRequestState.ACKNOWLEDGED.value,
    BankRequestState.MAKER_SUBMITTED.value,
    BankRequestState.ESCALATED.value,
)
_NOW = "2026-10-24T06:00:00Z"
_MOCK_BANK_REQUESTS = {
    request_id: BankRequestOut(
        id=request_id, instrument_id=stable_id("instrument", "takshashila"),
        bank_id=bank_id("BRB"), state=BankRequestState.NOTIFIED, outcome=None,
        remarks="12-point verification requested", created_at=_NOW, updated_at=_NOW,
    )
    for request_id in (stable_id("bank-request", "tak-brb-001"), "breq-tak-001")
}


def _updated_at(request: BankRequest) -> str:
    timestamp = request.responded_at or request.acknowledged_at or request.notified_at or request.created_at
    return timestamp.isoformat()


def _request_out(request: BankRequest) -> BankRequestOut:
    return BankRequestOut(
        id=request.id, instrument_id=request.instrument_id, bank_id=request.bank_id,
        state=request.state, outcome=request.outcome, remarks=request.remarks or request.reason,
        created_at=request.created_at.isoformat(), updated_at=_updated_at(request),
    )


def _request_detail(db, request: BankRequest) -> BankRequestDetail:
    contact = db.query(BankNodalContact).filter(
        BankNodalContact.id == request.directory_contact_id,
    ).first()
    if not contact:
        raise NotFoundError("Bank nodal contact", request.directory_contact_id or "")
    instrument = intake_service.get_instrument(request.instrument_id, db)
    if not instrument:
        raise NotFoundError("Instrument", request.instrument_id)
    values = {field.field_name: field.value for field in instrument.fields}
    try:
        principal = int(values.get("principal_paise") or 0)
    except (ValueError, TypeError):
        principal = 0
    checklist = db.query(BankChecklistItem).filter(
        BankChecklistItem.request_id == request.id,
    ).order_by(BankChecklistItem.item_no).all()
    return BankRequestDetail(
        id=request.id, instrument_id=request.instrument_id, bank_id=request.bank_id,
        state=request.state, outcome=request.outcome,
        directory_contact=DirectoryContact(
            name=contact.name, email=contact.email, phone=contact.phone, is_directory=True,
        ),
        checklist=[ChecklistItem(item_no=row.item_no, question=row.question,
                                 answer=row.answer, remarks=row.remarks) for row in checklist],
        instrument=InstrumentSummary(
            id=instrument.id, fdr_number=values.get("fdr_number") or "",
            bank_ifsc=values.get("bank_ifsc") or "", principal_paise=principal,
            maturity_date=values.get("maturity_date") or "", state=instrument.state,
        ),
        remarks=request.remarks or request.reason,
        created_at=request.created_at.isoformat(), updated_at=_updated_at(request),
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/banks", response_model=BankListResponse)
def list_banks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES, *_BANK_ROLES)),
):
    """List all banks in the AICTE directory."""
    db = SessionLocal()
    try:
        query = db.query(Bank).order_by(Bank.code)
        total = query.count()
        rows = query.offset((page - 1) * page_size).limit(page_size).all()
        return BankListResponse(items=[BankOut(
            id=row.id, name=row.name, code=row.code, swift=None, is_active=True,
        ) for row in rows], total=total)
    finally:
        db.close()


@router.get("/banks/{bid}/nodal-contacts", response_model=NodalContactListResponse)
def get_nodal_contacts(
    bid: str,
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES, *_BANK_ROLES)),
):
    """List nodal contacts for a bank."""
    db = SessionLocal()
    try:
        bank_obj = db.query(Bank).filter((Bank.id == bid) | (Bank.code == bid)).first()
        if not bank_obj:
            raise NotFoundError("Bank", bid)
        contacts = db.query(BankNodalContact).filter(
            BankNodalContact.bank_id == bank_obj.id,
        ).order_by(BankNodalContact.id).all()
        return NodalContactListResponse(items=[NodalContactOut(
            id=row.id, bank_id=row.bank_id, name=row.name, email=row.email,
            phone=row.phone, is_directory=True,
        ) for row in contacts], total=len(contacts))
    finally:
        db.close()


@router.post("/bank-requests", response_model=BankRequestOut)
def create_bank_request(
    payload: BankRequestCreate,
    current_user: User = Depends(require_roles(Role.SCRUTINY_OFFICER, Role.APPROVING_OFFICER)),
):
    """Create a new bank verification request for an instrument."""
    if not payload.reason or not payload.reason.strip():
        raise ValidationError("A bank request reason is required")
    request = service.create_request(payload.instrument_id, current_user, payload.reason)
    return _request_out(request)


@router.get("/bank-requests", response_model=BankRequestListResponse)
def list_bank_requests(
    state: BankRequestState | None = None,
    instrument_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES)),
):
    """List all bank verification requests (AICTE view)."""
    db = SessionLocal()
    try:
        query = db.query(BankRequest)
        if state is not None:
            query = query.filter(BankRequest.state == state.value)
        if instrument_id:
            query = query.filter(BankRequest.instrument_id == instrument_id)
        total = query.count()
        rows = query.order_by(BankRequest.created_at.desc(), BankRequest.id).offset(
            (page - 1) * page_size,
        ).limit(page_size).all()
        return BankRequestListResponse(items=[_request_out(row) for row in rows], total=total)
    finally:
        db.close()


@router.get("/bank-requests/{request_id}", response_model=BankRequestDetail)
def get_bank_request(
    request_id: str,
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES)),
):
    """Get bank request detail with checklist and instrument summary."""
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter(BankRequest.id == request_id).first()
        if not request:
            raise NotFoundError("Bank request", request_id)
        return _request_detail(db, request)
    finally:
        db.close()


@router.get("/bank/inbox", response_model=BankInboxResponse)
def bank_inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_BANK_ROLES)),
):
    """Bank-side inbox: pending verification requests for the bank user's bank."""
    db = SessionLocal()
    try:
        query = db.query(BankRequest).filter(BankRequest.state.in_(_OPEN_INBOX_STATES))
        if Role.SYSTEM_ADMIN.value not in current_user.roles:
            if not current_user.bank_id:
                return BankInboxResponse(items=[], total=0)
            query = query.filter(BankRequest.bank_id == current_user.bank_id)
        total = query.count()
        requests = query.order_by(BankRequest.created_at.desc(), BankRequest.id).offset(
            (page - 1) * page_size,
        ).limit(page_size).all()
        items = []
        for request in requests:
            instrument = intake_service.get_instrument(request.instrument_id, db)
            if not instrument:
                continue
            values = {field.field_name: field.value for field in instrument.fields}
            try:
                principal = int(values.get("principal_paise") or 0)
            except (TypeError, ValueError):
                principal = 0
            items.append(BankInboxItem(
                id=request.id, instrument_id=instrument.id,
                fdr_number=values.get("fdr_number") or "", principal_paise=principal,
                state=request.state, created_at=request.created_at.isoformat(),
            ))
        return BankInboxResponse(items=items, total=total)
    finally:
        db.close()


@router.get("/bank/requests/{request_id}", response_model=BankRequestDetail)
def bank_get_request(
    request_id: str,
    current_user: User = Depends(require_roles(*_BANK_ROLES)),
):
    """Bank-side request detail with checklist."""
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter(BankRequest.id == request_id).first()
        if not request or (
            Role.SYSTEM_ADMIN.value not in current_user.roles
            and (not current_user.bank_id or request.bank_id != current_user.bank_id)
        ):
            raise NotFoundError("Bank request", request_id)
        if (Role.BANK_MAKER.value in current_user.roles
                and request.state == BankRequestState.NOTIFIED.value):
            request.state = BankRequestState.ACKNOWLEDGED.value
            request.acknowledged_at = clock.now()
            audit.log(
                actor=current_user, action="BANK_REQUEST_ACKNOWLEDGED", entity_type="BANK_REQUEST",
                entity_id=request.id, payload={"bank_id": request.bank_id}, db=db,
            )
            db.commit()
            db.refresh(request)
        return _request_detail(db, request)
    finally:
        db.close()


@router.post("/bank/requests/{request_id}/maker-submit", response_model=BankRequestOut)
def maker_submit(
    request_id: str,
    payload: MakerSubmitRequest,
    current_user: User = Depends(require_roles(Role.BANK_MAKER)),
):
    """Bank Maker submits 12-point verification checklist with outcome."""
    db = SessionLocal()
    try:
        request = _scoped_request(db, request_id, current_user)
        if request.state not in (BankRequestState.NOTIFIED.value, BankRequestState.ACKNOWLEDGED.value):
            raise InvalidStateError("Bank request is not ready for maker submission")
        items = sorted(payload.checklist, key=lambda item: item.item_no)
        if payload.outcome != BankOutcome.NOT_FOUND and [item.item_no for item in items] != list(range(1, 13)):
            raise ValidationError("Checklist must contain items numbered 1 through 12")
        no_items = [item for item in items if item.answer is False]
        if payload.outcome == BankOutcome.ALL_CLEAR and (len(items) != 12 or no_items):
            raise ValidationError("ALL_CLEAR requires twelve Yes answers")
        if payload.outcome == BankOutcome.EXCEPTIONS and (
            len(items) != 12 or not no_items or any(not (item.remarks or "").strip() for item in no_items)
        ):
            raise ValidationError("EXCEPTIONS requires a No answer and remarks for every No")
        db.query(BankChecklistItem).filter(BankChecklistItem.request_id == request.id).delete()
        for item in items:
            db.add(BankChecklistItem(
                id=stable_id("checklist", f"{request.id}:{item.item_no}:{clock.now().isoformat()}"),
                request_id=request.id, item_no=item.item_no, question=item.question,
                answer=item.answer, remarks=item.remarks,
            ))
        request.state = BankRequestState.MAKER_SUBMITTED.value
        request.outcome = payload.outcome.value
        request.remarks = payload.remarks
        request.maker_id = current_user.id
        audit.log(actor=current_user, action="BANK_MAKER_SUBMITTED", entity_type="BANK_REQUEST",
                  entity_id=request.id, payload={"outcome": request.outcome}, db=db)
        db.commit()
        db.refresh(request)
        return _request_out(request)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/bank/requests/{request_id}/checker-decision", response_model=BankRequestOut)
def checker_decision(
    request_id: str,
    payload: CheckerDecisionRequest,
    current_user: User = Depends(require_roles(Role.BANK_CHECKER)),
):
    """Bank Checker authorises or returns the maker's submission."""
    db = SessionLocal()
    try:
        request = _scoped_request(db, request_id, current_user)
        if payload.decision not in {"AUTHORISE", "RETURN"}:
            raise ValidationError("Decision must be AUTHORISE or RETURN")
        if request.state != BankRequestState.MAKER_SUBMITTED.value:
            raise InvalidStateError("Bank request must be maker-submitted")
        sod.ensure_different(current_user, request.maker_id)
        if payload.decision == "RETURN":
            if not (payload.remarks or "").strip():
                raise ValidationError("Remarks are required when returning a submission")
            request.state = BankRequestState.ACKNOWLEDGED.value
            request.remarks = payload.remarks
            action = "BANK_CHECKER_RETURNED"
        else:
            request.checker_id = current_user.id
            request.responded_at = clock.now()
            action = "BANK_CHECKER_AUTHORISED"
            if request.outcome == BankOutcome.ALL_CLEAR.value:
                request.state = BankRequestState.CONFIRMED.value
                for field_name in (
                    "principal_paise", "maturity_date", "favouring", "holder_names", "lien_marked",
                    "lien_ref", "issue_date", "interest_rate_pct", "bank_ifsc", "fdr_number",
                ):
                    current = intake_service.get_fields(request.instrument_id, db).get(field_name, {})
                    value = "true" if field_name == "lien_marked" else current.get("value")
                    intake_service.set_field_trust(
                        request.instrument_id, field_name, TrustLevel.L2_BANK_CONFIRMED.value,
                        "BANK", request.id, value=value, db=db,
                    )
                intake_service.transition(request.instrument_id, InstrumentState.SCRUTINY, current_user,
                                          "Bank confirmed all checklist items", db)
                instrument = intake_service.get_instrument(request.instrument_id, db)
                intake_service.recompute_coverage(instrument.obligation_id, db)
            elif request.outcome == BankOutcome.EXCEPTIONS.value:
                request.state = BankRequestState.CONFIRMED_WITH_EXCEPTIONS.value
                _add_checklist_discrepancies(db, request)
                intake_service.transition(request.instrument_id, InstrumentState.DISCREPANCY, current_user,
                                          "Bank reported checklist exceptions", db)
            else:
                request.state = BankRequestState.NOT_FOUND.value
                intake_service.add_discrepancy(request.instrument_id, "D-02", "HIGH",
                                               {"quarantine_suggested": True}, db)
                intake_service.transition(request.instrument_id, InstrumentState.DISCREPANCY, current_user,
                                          "Bank could not find FDR", db)
                notify.send(title="Bank reports FDR not found", body=f"Request {request.id}",
                            role=Role.COMPLIANCE_OFFICER, level="HIGH", link=f"/bank-requests/{request.id}", db=db)
            notify.send(title="Bank verification decision", body=f"Request {request.id}: {request.state}",
                        user_id=request.created_by, link=f"/bank-requests/{request.id}", db=db)
        if payload.remarks:
            request.remarks = payload.remarks
        audit.log(actor=current_user, action=action, entity_type="BANK_REQUEST", entity_id=request.id,
                  payload={"decision": payload.decision, "state": request.state}, db=db)
        db.commit()
        db.refresh(request)
        return _request_out(request)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _scoped_request(db, request_id: str, user: User) -> BankRequest:
    request = db.query(BankRequest).filter(BankRequest.id == request_id).first()
    if not request or not user.bank_id or request.bank_id != user.bank_id:
        raise NotFoundError("Bank request", request_id)
    return request


def _add_checklist_discrepancies(db, request: BankRequest) -> None:
    codes = {1: "D-17", 2: "D-06", 3: "D-16", 4: "D-07", 5: "D-19", 6: "D-07",
             7: "D-14", 8: "D-15", 9: "D-17", 10: "D-10", 11: "D-15", 12: "D-10"}
    for row in db.query(BankChecklistItem).filter(
        BankChecklistItem.request_id == request.id, BankChecklistItem.answer.is_(False),
    ).all():
        code = codes.get(row.item_no, "D-10")
        intake_service.add_discrepancy(
            request.instrument_id, code, "MEDIUM" if code == "D-19" else "HIGH",
            {"checklist_item": row.item_no, "question": row.question, "remarks": row.remarks}, db,
        )


