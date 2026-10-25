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
from app.core.deps import require_roles
from app.core.enums import BankRequestState, InstrumentState, Role
from app.core.errors import NotFoundError, ValidationError
from app.core.models import User
from app.modules.bank.ids import bank_id, stable_id
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

_NOW = "2026-10-24T06:00:00Z"

_MOCK_BANKS = [
    BankOut(id=bank_id("BRB"), name="Bharat Reserve Bank", code="BRB", swift="BRBIN2D", is_active=True),
    BankOut(id=bank_id("HCB"), name="Heritage Commercial Bank", code="HCB", swift="HCBIN2M", is_active=True),
    BankOut(id=bank_id("SCB"), name="Sovereign Cooperative Bank", code="SCB", swift=None, is_active=True),
]
_BANKS_BY_ID = {b.id: b for b in _MOCK_BANKS}

_MOCK_CONTACT_BRB = NodalContactOut(
    id=stable_id("contact", "brb-nodal"),
    bank_id=bank_id("BRB"),
    name="Rajesh Kumar",
    email="rajesh.kumar@brb.example.in",
    phone="+91-11-23456789",
    is_directory=True,
)

_12_CHECKLIST: list[ChecklistItem] = [
    ChecklistItem(item_no=1, question="Is the FDR number genuine and present in CBS?"),
    ChecklistItem(item_no=2, question="Does the principal amount match CBS records?"),
    ChecklistItem(item_no=3, question="Is the maturity date consistent with CBS?"),
    ChecklistItem(item_no=4, question="Is the FDR issued in favour of Member Secretary, AICTE?"),
    ChecklistItem(item_no=5, question="Is the lien marked in favour of AICTE on CBS?"),
    ChecklistItem(item_no=6, question="Is the interest rate consistent with bank rate card?"),
    ChecklistItem(item_no=7, question="Are holder names matching trust registration?"),
    ChecklistItem(item_no=8, question="Is the issuing branch verified and active?"),
    ChecklistItem(item_no=9, question="Has the FDR been verified against physical register?"),
    ChecklistItem(item_no=10, question="Is the certificate serial number authentic?"),
    ChecklistItem(item_no=11, question="Are there any prior claims or encumbrances?"),
    ChecklistItem(item_no=12, question="Has the document been authenticated by branch manager?"),
]

_INSTRUMENT_SUMMARY = InstrumentSummary(
    id=stable_id("instrument", "takshashila"),
    fdr_number="BRB-FDR-2024-001001",
    bank_ifsc="BRBK0001234",
    principal_paise=450000000,
    maturity_date="2027-05-12",
    state=InstrumentState.BANK_PENDING.value,
)

_MOCK_BREQ_ID = stable_id("bank-request", "tak-brb-001")

_MOCK_BANK_REQUEST = BankRequestOut(
    id=_MOCK_BREQ_ID,
    instrument_id=stable_id("instrument", "takshashila"),
    bank_id=bank_id("BRB"),
    state=BankRequestState.NOTIFIED,
    outcome=None,
    remarks="12-point verification requested",
    created_at=_NOW,
    updated_at=_NOW,
)

_MOCK_BANK_REQUESTS: dict[str, BankRequestOut] = {
    _MOCK_BREQ_ID: _MOCK_BANK_REQUEST,
    "breq-tak-001": _MOCK_BANK_REQUEST.model_copy(update={"id": "breq-tak-001"}),
}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/banks", response_model=BankListResponse)
def list_banks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES, *_BANK_ROLES)),
):
    """List all banks in the AICTE directory."""
    # TODO PY-4: replace stub
    return BankListResponse(items=_MOCK_BANKS, total=len(_MOCK_BANKS))


@router.get("/banks/{bid}/nodal-contacts", response_model=NodalContactListResponse)
def get_nodal_contacts(
    bid: str,
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES, *_BANK_ROLES)),
):
    """List nodal contacts for a bank."""
    # TODO PY-4: replace stub
    bank_obj = _BANKS_BY_ID.get(bid) or next((b for b in _MOCK_BANKS if b.code == bid), None)
    if not bank_obj:
        raise NotFoundError("Bank", bid)
    contact = _MOCK_CONTACT_BRB.model_copy(update={"bank_id": bank_obj.id})
    return NodalContactListResponse(items=[contact], total=1)


@router.post("/bank-requests", response_model=BankRequestOut)
def create_bank_request(
    payload: BankRequestCreate,
    current_user: User = Depends(require_roles(*_AICTE_WRITE_ROLES)),
):
    """Create a new bank verification request for an instrument."""
    # TODO PY-4: replace stub
    new_id = stable_id("bank-request", f"new-{len(_MOCK_BANK_REQUESTS) + 1}")
    b_id = payload.bank_id or bank_id("BRB")
    req = BankRequestOut(
        id=new_id,
        instrument_id=payload.instrument_id,
        bank_id=b_id,
        state=BankRequestState.CREATED,
        outcome=None,
        remarks=payload.remarks or payload.reason,
        created_at=_NOW,
        updated_at=_NOW,
    )
    _MOCK_BANK_REQUESTS[new_id] = req
    return req


@router.get("/bank-requests", response_model=BankRequestListResponse)
def list_bank_requests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES)),
):
    """List all bank verification requests (AICTE view)."""
    # TODO PY-4: replace stub
    items = list(_MOCK_BANK_REQUESTS.values())
    return BankRequestListResponse(items=items, total=len(items))


@router.get("/bank-requests/{request_id}", response_model=BankRequestDetail)
def get_bank_request(
    request_id: str,
    current_user: User = Depends(require_roles(*_AICTE_VIEW_ROLES)),
):
    """Get bank request detail with checklist and instrument summary."""
    # TODO PY-4: replace stub
    req = _MOCK_BANK_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Bank request", request_id)
    return BankRequestDetail(
        id=req.id,
        instrument_id=req.instrument_id,
        bank_id=req.bank_id,
        state=req.state,
        outcome=req.outcome,
        directory_contact=DirectoryContact(
            name="Rajesh Kumar", email="rajesh.kumar@brb.example.in",
            phone="+91-11-23456789", is_directory=True,
        ),
        checklist=_12_CHECKLIST,
        instrument=_INSTRUMENT_SUMMARY,
        remarks=req.remarks,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/bank/inbox", response_model=BankInboxResponse)
def bank_inbox(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_BANK_ROLES)),
):
    """Bank-side inbox: pending verification requests for the bank user's bank."""
    # TODO PY-4: replace stub
    items = [
        BankInboxItem(
            id=_MOCK_BREQ_ID,
            instrument_id=stable_id("instrument", "takshashila"),
            fdr_number="BRB-FDR-2024-001001",
            principal_paise=450000000,
            state=BankRequestState.NOTIFIED,
            created_at=_NOW,
        ),
    ]
    return BankInboxResponse(items=items, total=len(items))


@router.get("/bank/requests/{request_id}", response_model=BankRequestDetail)
def bank_get_request(
    request_id: str,
    current_user: User = Depends(require_roles(*_BANK_ROLES)),
):
    """Bank-side request detail with checklist."""
    # TODO PY-4: replace stub
    req = _MOCK_BANK_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Bank request", request_id)
    return BankRequestDetail(
        id=req.id,
        instrument_id=req.instrument_id,
        bank_id=req.bank_id,
        state=req.state,
        outcome=req.outcome,
        directory_contact=DirectoryContact(
            name="Rajesh Kumar", email="rajesh.kumar@brb.example.in",
            phone="+91-11-23456789", is_directory=True,
        ),
        checklist=_12_CHECKLIST,
        instrument=_INSTRUMENT_SUMMARY,
        remarks=req.remarks,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.post("/bank/requests/{request_id}/maker-submit", response_model=BankRequestOut)
def maker_submit(
    request_id: str,
    payload: MakerSubmitRequest,
    current_user: User = Depends(require_roles(Role.BANK_MAKER, Role.SYSTEM_ADMIN)),
):
    """Bank Maker submits 12-point verification checklist with outcome."""
    # TODO PY-4: replace stub
    req = _MOCK_BANK_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Bank request", request_id)
    return req.model_copy(update={
        "state": BankRequestState.MAKER_SUBMITTED,
        "outcome": payload.outcome,
        "updated_at": _NOW,
    })


@router.post("/bank/requests/{request_id}/checker-decision", response_model=BankRequestOut)
def checker_decision(
    request_id: str,
    payload: CheckerDecisionRequest,
    current_user: User = Depends(require_roles(Role.BANK_CHECKER, Role.SYSTEM_ADMIN)),
):
    """Bank Checker authorises or returns the maker's submission."""
    # TODO PY-4: replace stub
    valid_decisions = {"AUTHORISE", "RETURN"}
    if payload.decision not in valid_decisions:
        raise ValidationError(
            f"Invalid decision '{payload.decision}'; must be AUTHORISE or RETURN",
            details={"allowed": sorted(valid_decisions)},
        )
    req = _MOCK_BANK_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Bank request", request_id)
    new_state = BankRequestState.CONFIRMED if payload.decision == "AUTHORISE" else BankRequestState.NOTIFIED
    return req.model_copy(update={
        "state": new_state,
        "updated_at": _NOW,
    })
