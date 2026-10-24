"""
Release module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  Release Requests:
    POST /release/requests
    GET  /release/requests
    GET  /release/requests/{id}
    POST /release/requests/{id}/resubmit
    POST /release/requests/{id}/recommend
    POST /release/requests/{id}/reject
    POST /release/requests/{id}/sign       (step-up)
  Release Letters:
    POST /release/letters/{id}/revoke
    GET  /release/letters/{id}
    GET  /release/letters/{id}/pdf
  Compliance Holds:
    GET  /holds
    POST /holds
    POST /holds/{id}/lift
  Bank Execution:
    GET  /bank/letters
    POST /bank/letters/{id}/execute-maker
    POST /bank/letters/{id}/execute-checker
  Finance Settlement:
    GET  /finance/settlements
    POST /finance/settlements/{release_id}/confirm
"""
from datetime import timedelta
import io

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core import audit, clock
from app.core.db import get_db
from app.core.deps import get_current_user, require_roles, require_step_up
from app.core.enums import CaseType, LetterState, ReleaseState, Role, RuleResult
from app.core.errors import NotFoundError
from app.core.models import User
from app.modules.intake.ids import institute_id
from app.modules.release.schemas import (
    BankExecuteCheckerRequest,
    BankExecuteMakerRequest,
    BankLetterListResponse,
    BankLetterOut,
    EligibilityRuleResultOut,
    HoldCreateRequest,
    HoldLiftRequest,
    HoldListResponse,
    HoldOut,
    HoldScope,
    LetterRevokeRequest,
    ReleaseLetterOut,
    ReleaseRecommendRequest,
    ReleaseRejectRequest,
    ReleaseRequestCreate,
    ReleaseRequestDetailOut,
    ReleaseRequestListResponse,
    ReleaseRequestOut,
    ReleaseSignResponse,
    SettlementBreakdownOut,
    SettlementConfirmRequest,
    SettlementListResponse,
    SettlementOut,
)

router = APIRouter(tags=["release"])

# ── Mock Data Fixtures (§3.5) ──────────────────────────────────────────────────

_MOCK_RULES = [
    EligibilityRuleResultOut(rule_id="E-01", name="Tenor Completion", result=RuleResult.PASS, message="Obligation 10-year term completed on 2026-05-15"),
    EligibilityRuleResultOut(rule_id="E-02", name="Instrument Active", result=RuleResult.PASS, message="Instrument state is ACTIVE with L2 Bank Confirmation"),
    EligibilityRuleResultOut(rule_id="E-03", name="Coverage Verified", result=RuleResult.PASS, message="Total active instruments meet required 45 Lakhs deposit"),
    EligibilityRuleResultOut(rule_id="E-04", name="Release Lock Free", result=RuleResult.PASS, message="No concurrent release lock on instrument"),
    EligibilityRuleResultOut(rule_id="E-05", name="Discrepancy Check", result=RuleResult.PASS, message="Zero open high-severity discrepancies"),
    EligibilityRuleResultOut(rule_id="E-06", name="Compliance Hold Check", result=RuleResult.PASS, message="No active legal or compliance holds on institute"),
    EligibilityRuleResultOut(rule_id="E-07", name="Custody Original Check", result=RuleResult.PASS, message="Physical FDR receipt logged in AICTE custody registry"),
    EligibilityRuleResultOut(rule_id="E-08", name="Confirmation Freshness", result=RuleResult.PASS, message="Bank confirmation freshness 14 days (threshold: 90 days)"),
]

_MOCK_RELEASE_REQUESTS: dict[str, dict] = {
    "rel-req-1": {
        "id": "rel-req-1",
        "obligation_id": "ob-aryabhatta-ug",
        "institute_id": institute_id("aryabhatta"),
        "institute_name": "Aryabhatta College of Engineering",
        "case_type": CaseType.TERM_COMPLETE,
        "state": ReleaseState.RECOMMENDED,
        "instrument_ids": ["inst-aryabhatta-fdr1"],
        "total_amount_paise": 450000000,
        "settlement": SettlementBreakdownOut(
            principal_to_trust_paise=450000000,
            aicte_share_paise=0,
            penalty_paise=0,
            interest_paise=0,
        ),
        "letter_id": "letter-arya-term-2026",
        "recommender_id": "ao1",
        "recommendation_note": "10-year term complete. All 12-point bank checks verified. Recommended for release.",
        "rejection_reason": None,
        "created_at": "2026-05-16T10:00:00Z",
        "updated_at": "2026-05-16T12:00:00Z",
    },
    "rel-req-2": {
        "id": "rel-req-2",
        "obligation_id": "ob-vidyajyoti-poly",
        "institute_id": institute_id("vidyajyoti"),
        "institute_name": "Vidya Jyoti Polytechnic Institute",
        "case_type": CaseType.TERM_COMPLETE,
        "state": ReleaseState.SUBMITTED,
        "instrument_ids": ["inst-vidyajyoti-fdr1"],
        "total_amount_paise": 150000000,
        "settlement": SettlementBreakdownOut(
            principal_to_trust_paise=150000000,
            aicte_share_paise=0,
            penalty_paise=0,
            interest_paise=0,
        ),
        "letter_id": None,
        "recommender_id": None,
        "recommendation_note": None,
        "rejection_reason": None,
        "created_at": "2026-05-17T09:00:00Z",
        "updated_at": "2026-05-17T09:00:00Z",
    },
}

_MOCK_LETTER = ReleaseLetterOut(
    id="letter-arya-term-2026",
    release_request_id="rel-req-1",
    institute_id=institute_id("aryabhatta"),
    institute_name="Aryabhatta College of Engineering",
    bank_id="BRB",
    bank_name="Bharat Reserve Bank",
    fdr_number="FDR-ARYA-401928",
    state=LetterState.ISSUED,
    verification_code="SAK-2026-ARYA-8841",
    letter_hash="8f3b9c2409d57a627be6396e4df71e35fa83c31e956972e61df3f789b78e351a",
    signature_hex="3b9a712f6c8d4e1a0b5f9e2c4d7a8b1c3e5f7a9b0c2d4e6f8a1b3c5d7e9f0a2b",
    principal_paise=450000000,
    aicte_share_paise=0,
    destination_account={
        "beneficiary": "Member Secretary, AICTE",
        "account_number": "99990000123456",
        "bank_name": "State Bank of India",
        "ifsc": "SBIN0000001",
    },
    issued_date="2026-05-16T14:00:00Z",
    valid_until="2026-05-30T14:00:00Z",
)

_MOCK_HOLDS: list[dict] = [
    {
        "id": "hold-nalanda-compliance",
        "scope": HoldScope.INSTITUTE,
        "entity_id": institute_id("nalanda"),
        "reason": "Section 10-A statutory compliance inquiry pending",
        "legal_ref": "AICTE/LEGAL/2026/8821",
        "is_active": True,
        "placed_by_id": "co1",
        "placed_at": "2026-05-10T11:00:00Z",
        "lifted_by_id": None,
        "lifted_at": None,
        "lift_reason": None,
    }
]

_MOCK_SETTLEMENTS: list[dict] = [
    {
        "id": "set-arya-2026",
        "release_request_id": "rel-req-1",
        "letter_id": "letter-arya-term-2026",
        "institute_id": institute_id("aryabhatta"),
        "institute_name": "Aryabhatta College of Engineering",
        "bank_name": "Bharat Reserve Bank",
        "expected_aicte_share_paise": 0,
        "credited_paise": 0,
        "bank_ref": "UTR-BRB-992817462",
        "is_settled": False,
        "confirmed_at": None,
        "override_note": None,
    }
]


# ── Release Requests Endpoints ─────────────────────────────────────────────────

_RELEASE_VIEW_ROLES = [
    Role.INS_SIGNATORY,
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.RELEASE_AUTHORITY,
    Role.FINANCE_OFFICER,
    Role.LEADERSHIP,
    Role.SYSTEM_ADMIN,
]


@router.get("/release/requests", response_model=ReleaseRequestListResponse)
def list_release_requests(
    state: ReleaseState | None = None,
    current_user: User = Depends(require_roles(*_RELEASE_VIEW_ROLES)),
    db: Session = Depends(get_db),
):
    """List release requests. Institute signatories see only their institute's cases."""
    requests = list(_MOCK_RELEASE_REQUESTS.values())

    if current_user.institute_id:
        requests = [r for r in requests if r["institute_id"] == current_user.institute_id]

    if state is not None:
        requests = [r for r in requests if r["state"] == state]

    return ReleaseRequestListResponse(
        items=[ReleaseRequestOut(**r) for r in requests],
        total=len(requests),
    )


@router.post("/release/requests", response_model=ReleaseRequestOut)
def create_release_request(
    payload: ReleaseRequestCreate,
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Submit a formal release request for a matured obligation."""
    req_id = f"rel-req-{len(_MOCK_RELEASE_REQUESTS) + 1}"
    inst_id = current_user.institute_id or institute_id("aryabhatta")
    now_iso = clock.now().isoformat()

    new_req = {
        "id": req_id,
        "obligation_id": payload.obligation_id,
        "institute_id": inst_id,
        "institute_name": current_user.display_name or "Institute of Technology",
        "case_type": payload.case_type,
        "state": ReleaseState.SUBMITTED,
        "instrument_ids": payload.instrument_ids or ["inst-submitted-fdr"],
        "total_amount_paise": 450000000,
        "settlement": SettlementBreakdownOut(
            principal_to_trust_paise=450000000,
            aicte_share_paise=0,
            penalty_paise=0,
            interest_paise=0,
        ),
        "letter_id": None,
        "recommender_id": None,
        "recommendation_note": None,
        "rejection_reason": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    _MOCK_RELEASE_REQUESTS[req_id] = new_req
    return ReleaseRequestOut(**new_req)


@router.get("/release/requests/{request_id}", response_model=ReleaseRequestDetailOut)
def get_release_request_detail(
    request_id: str,
    current_user: User = Depends(require_roles(*_RELEASE_VIEW_ROLES)),
    db: Session = Depends(get_db),
):
    """Retrieve full release case workspace with eligibility breakdown and settlement calculation."""
    req = _MOCK_RELEASE_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Release request not found")

    return ReleaseRequestDetailOut(
        **req,
        eligibility_verdict="ELIGIBLE",
        rules=_MOCK_RULES,
        audit_trail=[
            {"seq": 101, "action": "RELEASE_REQUEST_SUBMITTED", "actor_id": "ar_sig", "ts": req["created_at"]},
            {"seq": 102, "action": "ELIGIBILITY_EVALUATED", "actor_id": "system", "verdict": "ELIGIBLE"},
        ],
    )


@router.post("/release/requests/{request_id}/resubmit", response_model=ReleaseRequestOut)
def resubmit_release_request(
    request_id: str,
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Resubmit a release request after rectifying compliance holds or discrepancies."""
    req = _MOCK_RELEASE_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Release request not found")

    req["state"] = ReleaseState.SUBMITTED
    req["updated_at"] = clock.now().isoformat()
    return ReleaseRequestOut(**req)


@router.post("/release/requests/{request_id}/recommend", response_model=ReleaseRequestOut)
def recommend_release_request(
    request_id: str,
    payload: ReleaseRecommendRequest,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Approving Officer recommends case for Member Secretary / Release Authority sign-off."""
    req = _MOCK_RELEASE_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Release request not found")

    req["state"] = ReleaseState.RECOMMENDED
    req["recommender_id"] = current_user.id
    req["recommendation_note"] = payload.recommendation_note
    req["updated_at"] = clock.now().isoformat()
    return ReleaseRequestOut(**req)


@router.post("/release/requests/{request_id}/reject", response_model=ReleaseRequestOut)
def reject_release_request(
    request_id: str,
    payload: ReleaseRejectRequest,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.RELEASE_AUTHORITY, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Reject release request with mandatory reason."""
    req = _MOCK_RELEASE_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Release request not found")

    req["state"] = ReleaseState.REJECTED
    req["rejection_reason"] = payload.reason
    req["updated_at"] = clock.now().isoformat()
    return ReleaseRequestOut(**req)


@router.post("/release/requests/{request_id}/sign", response_model=ReleaseSignResponse)
def sign_release_request(
    request_id: str,
    current_user: User = Depends(require_roles(Role.RELEASE_AUTHORITY, Role.SYSTEM_ADMIN)),
    stepped_up_user: User = Depends(require_step_up),
    db: Session = Depends(get_db),
):
    """Member Secretary signs release letter using cryptographic key (requires 6-digit PIN step-up)."""
    req = _MOCK_RELEASE_REQUESTS.get(request_id)
    if not req:
        raise NotFoundError("Release request not found")

    req["state"] = ReleaseState.APPROVED
    req["letter_id"] = _MOCK_LETTER.id
    req["updated_at"] = clock.now().isoformat()

    return ReleaseSignResponse(
        status="SIGNED",
        request_id=request_id,
        letter_id=_MOCK_LETTER.id,
        verification_code=_MOCK_LETTER.verification_code,
        letter_hash=_MOCK_LETTER.letter_hash,
        signed_at=clock.now().isoformat(),
        pdf_url=f"/api/release/letters/{_MOCK_LETTER.id}/pdf",
    )


# ── Release Letters Endpoints ──────────────────────────────────────────────────

@router.get("/release/letters/{letter_id}", response_model=ReleaseLetterOut)
def get_release_letter(
    letter_id: str,
    current_user: User = Depends(require_roles(*_RELEASE_VIEW_ROLES, Role.BANK_MAKER, Role.BANK_CHECKER)),
    db: Session = Depends(get_db),
):
    """Retrieve issued release letter metadata and cryptographic signature."""
    if letter_id != _MOCK_LETTER.id:
        raise NotFoundError("Release letter not found")
    return _MOCK_LETTER


@router.get("/release/letters/{letter_id}/pdf")
def get_release_letter_pdf(
    letter_id: str,
    current_user: User = Depends(require_roles(*_RELEASE_VIEW_ROLES, Role.BANK_MAKER, Role.BANK_CHECKER)),
    db: Session = Depends(get_db),
):
    """Download or stream official release letter PDF with cryptographic QR code."""
    # Generate minimal valid PDF stream for contract verification
    minimal_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000053 00000 n\n0000000102 00000 n\n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
    )
    return Response(
        content=minimal_pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=release_letter_{letter_id}.pdf"},
    )


@router.post("/release/letters/{letter_id}/revoke", response_model=ReleaseLetterOut)
def revoke_release_letter(
    letter_id: str,
    payload: LetterRevokeRequest,
    current_user: User = Depends(require_roles(Role.RELEASE_AUTHORITY, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Revoke issued release letter before bank execution (e.g. upon discovery of fraud)."""
    if letter_id != _MOCK_LETTER.id:
        raise NotFoundError("Release letter not found")

    revoked = _MOCK_LETTER.model_copy(
        update={
            "state": LetterState.REVOKED,
            "revoke_reason": payload.reason,
        }
    )
    return revoked


# ── Compliance Holds Endpoints ─────────────────────────────────────────────────

_HOLD_ROLES = [
    Role.COMPLIANCE_OFFICER,
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.RELEASE_AUTHORITY,
    Role.SYSTEM_ADMIN,
]


@router.get("/holds", response_model=HoldListResponse)
def list_holds(
    active_only: bool = Query(True),
    scope: HoldScope | None = None,
    current_user: User = Depends(require_roles(*_HOLD_ROLES)),
    db: Session = Depends(get_db),
):
    """List legal and compliance holds."""
    holds = _MOCK_HOLDS
    if active_only:
        holds = [h for h in holds if h["is_active"]]
    if scope:
        holds = [h for h in holds if h["scope"] == scope]

    return HoldListResponse(items=[HoldOut(**h) for h in holds], total=len(holds))


@router.post("/holds", response_model=HoldOut)
def place_hold(
    payload: HoldCreateRequest,
    current_user: User = Depends(require_roles(Role.COMPLIANCE_OFFICER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Place compliance hold on institute, trust, or instrument (blocks release)."""
    hold_id = f"hold-{len(_MOCK_HOLDS) + 1}"
    new_hold = {
        "id": hold_id,
        "scope": payload.scope,
        "entity_id": payload.entity_id,
        "reason": payload.reason,
        "legal_ref": payload.legal_ref,
        "is_active": True,
        "placed_by_id": current_user.id,
        "placed_at": clock.now().isoformat(),
        "lifted_by_id": None,
        "lifted_at": None,
        "lift_reason": None,
    }
    _MOCK_HOLDS.append(new_hold)
    return HoldOut(**new_hold)


@router.post("/holds/{hold_id}/lift", response_model=HoldOut)
def lift_hold(
    hold_id: str,
    payload: HoldLiftRequest,
    current_user: User = Depends(require_roles(Role.COMPLIANCE_OFFICER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Lift an active compliance hold."""
    hold = next((h for h in _MOCK_HOLDS if h["id"] == hold_id), None)
    if not hold:
        raise NotFoundError("Compliance hold not found")

    hold["is_active"] = False
    hold["lifted_by_id"] = current_user.id
    hold["lifted_at"] = clock.now().isoformat()
    hold["lift_reason"] = payload.reason
    return HoldOut(**hold)


# ── Bank Execution Endpoints ───────────────────────────────────────────────────

@router.get("/bank/letters", response_model=BankLetterListResponse)
def list_bank_release_letters(
    current_user: User = Depends(require_roles(Role.BANK_MAKER, Role.BANK_CHECKER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """List release letters pending execution in the bank workspace."""
    mock_bank_letters = [
        BankLetterOut(
            letter_id=_MOCK_LETTER.id,
            fdr_number=_MOCK_LETTER.fdr_number,
            institute_name=_MOCK_LETTER.institute_name,
            principal_paise=_MOCK_LETTER.principal_paise,
            aicte_share_paise=_MOCK_LETTER.aicte_share_paise,
            status="PENDING_EXECUTION",
            utr=None,
            executed_at=None,
        )
    ]
    return BankLetterListResponse(items=mock_bank_letters, total=len(mock_bank_letters))


@router.post("/bank/letters/{letter_id}/execute-maker", response_model=BankLetterOut)
def execute_release_letter_maker(
    letter_id: str,
    payload: BankExecuteMakerRequest,
    current_user: User = Depends(require_roles(Role.BANK_MAKER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Bank maker records UTR and remittance details for released FDR."""
    return BankLetterOut(
        letter_id=letter_id,
        fdr_number=_MOCK_LETTER.fdr_number,
        institute_name=_MOCK_LETTER.institute_name,
        principal_paise=payload.principal_paise,
        aicte_share_paise=payload.aicte_share_paise,
        status="MAKER_EXECUTED",
        utr=payload.utr,
        executed_at=clock.now().isoformat(),
    )


@router.post("/bank/letters/{letter_id}/execute-checker", response_model=BankLetterOut)
def execute_release_letter_checker(
    letter_id: str,
    payload: BankExecuteCheckerRequest,
    current_user: User = Depends(require_roles(Role.BANK_CHECKER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Bank checker confirms authorization of remittance."""
    return BankLetterOut(
        letter_id=letter_id,
        fdr_number=_MOCK_LETTER.fdr_number,
        institute_name=_MOCK_LETTER.institute_name,
        principal_paise=_MOCK_LETTER.principal_paise,
        aicte_share_paise=_MOCK_LETTER.aicte_share_paise,
        status="CHECKER_CONFIRMED",
        utr="UTR-BRB-992817462",
        executed_at=clock.now().isoformat(),
    )


# ── Finance Settlement Endpoints ───────────────────────────────────────────────

@router.get("/finance/settlements", response_model=SettlementListResponse)
def list_finance_settlements(
    current_user: User = Depends(require_roles(Role.FINANCE_OFFICER, Role.LEADERSHIP, Role.AUDITOR, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """List FDR release settlements for Finance Officer reconciliation."""
    return SettlementListResponse(
        items=[SettlementOut(**s) for s in _MOCK_SETTLEMENTS],
        total=len(_MOCK_SETTLEMENTS),
    )


@router.post("/finance/settlements/{release_id}/confirm", response_model=SettlementOut)
def confirm_settlement(
    release_id: str,
    payload: SettlementConfirmRequest,
    current_user: User = Depends(require_roles(Role.FINANCE_OFFICER, Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Finance officer confirms bank credit reconciliation (closing case)."""
    settlement = _MOCK_SETTLEMENTS[0]
    settlement["is_settled"] = True
    settlement["credited_paise"] = payload.credited_paise
    settlement["bank_ref"] = payload.bank_ref
    settlement["override_note"] = payload.override_note
    settlement["confirmed_at"] = clock.now().isoformat()
    return SettlementOut(**settlement)
