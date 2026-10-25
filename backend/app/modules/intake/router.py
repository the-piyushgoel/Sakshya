# ruff: noqa: B008
"""
Intake module router — owned by Piyush (Lane B).

Endpoints from §3.5:
  GET  /institutes/me
  GET  /obligations
  GET  /obligations/{id}
  POST /documents/preview
  POST /instruments
  GET  /instruments
  GET  /instruments/{id}
  GET  /instruments/{id}/timeline
  GET  /instruments/{id}/document
  GET  /discrepancies
  POST /discrepancies/{id}/resolve
  POST /instruments/{id}/quarantine
  POST /instruments/{id}/reject
  POST /instruments/{id}/renew
  POST /instruments/{id}/activate
"""
from pathlib import Path

from app.core.db import SessionLocal
from app.core.deps import require_roles, require_step_up
from app.core.enums import (
    BankRequestState,
    DiscrepancyStatus,
    DocCheckOutcome,
    InstrumentState,
    ObligationState,
    Role,
    Severity,
    TrustLevel,
)
from app.core.errors import NotFoundError, ValidationError
from app.core.models import User
from app.modules.intake.ids import bank_id, institute_id, stable_id
from app.modules.intake.pipeline import submit_instrument
from app.modules.intake.schemas import (
    BankRequestSummary,
    DiscrepancyListResponse,
    DiscrepancyOut,
    DiscrepancyResolveRequest,
    DocCheck,
    DocumentPreviewResponse,
    ExtractedFieldValue,
    InstituteOut,
    InstrumentActionResponse,
    InstrumentDetail,
    InstrumentField,
    InstrumentListResponse,
    InstrumentOut,
    InstrumentRenewRequest,
    InstrumentVersion,
    ObligationListResponse,
    ObligationOut,
    ObligationSummary,
    TimelineEvent,
)
from app.modules.intake.uploads import validate_pdf
from doc_intel import analyze
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

router = APIRouter(tags=["intake"])

# ── Role groups ────────────────────────────────────────────────────────────────

_INTAKE_VIEW_ROLES = [
    Role.INS_SIGNATORY,
    Role.INS_ADMIN,
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.COMPLIANCE_OFFICER,
    Role.LEADERSHIP,
    Role.AUDITOR,
    Role.SYSTEM_ADMIN,
]

_INTAKE_WRITE_ROLES = [
    Role.INS_SIGNATORY,
    Role.SYSTEM_ADMIN,
]

_SCRUTINY_ROLES = [
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.SYSTEM_ADMIN,
]

# ── Mock example data (one place, reused across endpoints) ─────────────────────

_NOW = "2026-10-24T06:00:00Z"

_ARYABHATTA_FIELDS = [
    InstrumentField(name="fdr_number", value="FDR-ARYA-401928", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="bank_ifsc", value="BRBK0001234", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="principal_paise", value="450000000", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="issue_date", value="2025-10-24", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="maturity_date", value="2027-10-24", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="interest_rate_pct", value="7.25", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="favouring", value="Member Secretary, AICTE", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="holder_names", value="Aryabhatta Trust", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="lien_marked", value="true", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="lien_ref", value="LIEN-ARYA-2025", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
    InstrumentField(name="accrued_interest_paise", value="0", trust=TrustLevel.L0_CLAIMED, source="OCR", evidence_ref="doc-arya-scan-001", set_at=_NOW),
]

_TAKSHASHILA_FIELDS = [
    InstrumentField(name="fdr_number", value="BRB-FDR-2024-001001", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="bank_ifsc", value="BRBK0001234", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="principal_paise", value="450000000", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="issue_date", value="2025-10-24", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="maturity_date", value="2027-05-12", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="interest_rate_pct", value="7.25", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="favouring", value="Member Secretary, AICTE", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="holder_names", value="Takshashila Trust", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="lien_marked", value="true", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="lien_ref", value="LIEN-TAK-2024", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
    InstrumentField(name="accrued_interest_paise", value="0", trust=TrustLevel.L2_BANK_CONFIRMED, source="BANK", evidence_ref="breq-tak-001", set_at=_NOW),
]

_MOCK_OBLIGATION_ARYABHATTA = ObligationOut(
    id=stable_id("obligation", "aryabhatta"),
    institute_id=institute_id("aryabhatta"),
    trust_id=stable_id("trust", "aryabhatta"),
    programme="AICTE FDR obligation",
    required_paise=450000000,
    term_years=10,
    start_date="2025-10-24",
    end_date="2036-06-28",
    state=ObligationState.PENDING_DEPOSIT,
    covered_paise=0,
    instruments_count=0,
)

_MOCK_OBLIGATION_TAKSHASHILA = ObligationOut(
    id=stable_id("obligation", "takshashila"),
    institute_id=institute_id("takshashila"),
    trust_id=stable_id("trust", "takshashila"),
    programme="AICTE FDR obligation",
    required_paise=450000000,
    term_years=10,
    start_date="2025-10-24",
    end_date="2036-06-28",
    state=ObligationState.COVERED,
    covered_paise=450000000,
    instruments_count=1,
)

_MOCK_OBLIGATIONS = [_MOCK_OBLIGATION_ARYABHATTA, _MOCK_OBLIGATION_TAKSHASHILA]

_MOCK_INST_ARYABHATTA = InstrumentOut(
    id=stable_id("instrument", "aryabhatta"),
    obligation_id=stable_id("obligation", "aryabhatta"),
    institute_id=institute_id("aryabhatta"),
    bank_id=bank_id("BRB"),
    state=InstrumentState.SUBMITTED,
    is_quarantined=False,
    fdr_number="FDR-ARYA-401928",
    principal_paise=450000000,
    maturity_date="2027-10-24",
    created_at=_NOW,
)

_MOCK_INST_TAKSHASHILA = InstrumentOut(
    id=stable_id("instrument", "takshashila"),
    obligation_id=stable_id("obligation", "takshashila"),
    institute_id=institute_id("takshashila"),
    bank_id=bank_id("BRB"),
    state=InstrumentState.ACTIVE,
    is_quarantined=False,
    fdr_number="BRB-FDR-2024-001001",
    principal_paise=450000000,
    maturity_date="2027-05-12",
    created_at=_NOW,
)

_MOCK_INSTRUMENTS: dict[str, InstrumentOut] = {
    _MOCK_INST_ARYABHATTA.id: _MOCK_INST_ARYABHATTA,
    _MOCK_INST_TAKSHASHILA.id: _MOCK_INST_TAKSHASHILA,
}

_MOCK_DISCREPANCY = DiscrepancyOut(
    id=stable_id("discrepancy", "arya-d11"),
    instrument_id=stable_id("instrument", "aryabhatta"),
    code="D-11",
    severity=Severity.HIGH,
    status=DiscrepancyStatus.OPEN,
    details={"source": "doc_intel", "message": "Possible tampered document detected"},
    created_at=_NOW,
)

_GENUINE_PREVIEW = DocumentPreviewResponse(
    extracted={
        "fdr_number": ExtractedFieldValue(value="FDR-ARYA-401928", confidence=0.97, source="OCR"),
        "bank_ifsc": ExtractedFieldValue(value="BRBK0001234", confidence=0.95, source="OCR"),
        "principal_paise": ExtractedFieldValue(value="450000000", confidence=0.98, source="OCR"),
        "issue_date": ExtractedFieldValue(value="2025-10-24", confidence=0.96, source="OCR"),
        "maturity_date": ExtractedFieldValue(value="2027-10-24", confidence=0.96, source="OCR"),
        "interest_rate_pct": ExtractedFieldValue(value="7.25", confidence=0.94, source="OCR"),
        "favouring": ExtractedFieldValue(value="Member Secretary, AICTE", confidence=0.92, source="OCR"),
    },
    checks=[
        DocCheck(name="format_valid", outcome=DocCheckOutcome.PASS, confidence=0.99, details="PDF structure OK"),
        DocCheck(name="metadata_intact", outcome=DocCheckOutcome.PASS, confidence=0.98, details="No metadata anomalies"),
        DocCheck(name="tamper_detection", outcome=DocCheckOutcome.PASS, confidence=0.97, details="No tamper signals detected"),
    ],
    flags=[],
)

_TAMPERED_PREVIEW = DocumentPreviewResponse(
    extracted={
        "fdr_number": ExtractedFieldValue(value="FDR-FAKE-999999", confidence=0.72, source="OCR"),
        "bank_ifsc": ExtractedFieldValue(value="FAKB0009999", confidence=0.68, source="OCR"),
        "principal_paise": ExtractedFieldValue(value="450000000", confidence=0.80, source="OCR"),
    },
    checks=[
        DocCheck(name="format_valid", outcome=DocCheckOutcome.PASS, confidence=0.95, details="PDF structure OK"),
        DocCheck(name="metadata_intact", outcome=DocCheckOutcome.FLAG, confidence=0.40, details="Metadata modification date inconsistent"),
        DocCheck(name="tamper_detection", outcome=DocCheckOutcome.FLAG, confidence=0.35, details="Digital signature missing; font substitution detected"),
    ],
    flags=["D-11"],
)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/institutes/me", response_model=InstituteOut)
def get_my_institute(
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY, Role.INS_ADMIN, Role.SYSTEM_ADMIN)),
):
    """Return the institute profile for the current user."""
    # TODO PY-2b: replace stub
    return InstituteOut(
        id=current_user.institute_id or institute_id("aryabhatta"),
        name="Aryabhatta College of Engineering",
        code="ARYABHATTA",
        city="New Delhi",
    )


@router.get("/obligations", response_model=ObligationListResponse)
def list_obligations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """List FDR obligations for the user's institute (or all for officers)."""
    # TODO PY-2b: replace stub
    items = _MOCK_OBLIGATIONS
    if current_user.institute_id:
        items = [o for o in items if o.institute_id == current_user.institute_id]
    return ObligationListResponse(items=items, total=len(items))


@router.get("/obligations/{obligation_id}", response_model=ObligationOut)
def get_obligation(
    obligation_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """Get a single obligation by ID."""
    # TODO PY-2b: replace stub
    for ob in _MOCK_OBLIGATIONS:
        if ob.id == obligation_id:
            return ob
    raise NotFoundError("Obligation", obligation_id)


@router.post("/documents/preview", response_model=DocumentPreviewResponse)
def preview_document(
    file: UploadFile = File(...),
    fdr_number: str | None = Form(None),
    bank_ifsc: str | None = Form(None),
    principal_paise: int | None = Form(None),
    issue_date: str | None = Form(None),
    maturity_date: str | None = Form(None),
    interest_rate_pct: str | None = Form(None),
    favouring: str | None = Form(None),
    holder_names: str | None = Form(None),
    current_user: User = Depends(require_roles(*_INTAKE_WRITE_ROLES, Role.SCRUTINY_OFFICER)),
):
    """Upload a PDF for AI-powered field extraction and tamper checks."""
    data = file.file.read()
    validate_pdf(data, file.filename or "")
    entered = {
        key: value for key, value in {
            "fdr_number": fdr_number, "bank_ifsc": bank_ifsc,
            "principal_paise": principal_paise, "issue_date": issue_date,
            "maturity_date": maturity_date, "interest_rate_pct": interest_rate_pct,
            "favouring": favouring, "holder_names": holder_names,
        }.items() if value is not None
    }
    result = analyze(data, entered)
    result["extracted"] = {
        name: {**field, "value": str(field["value"])}
        for name, field in result.get("extracted", {}).items()
    }
    return DocumentPreviewResponse.model_validate(result)


@router.post("/instruments", response_model=InstrumentDetail)
def create_instrument(
    file: UploadFile = File(...),
    obligation_id: str = Form(...),
    fdr_number: str = Form(...),
    bank_ifsc: str = Form(...),
    principal_paise: int = Form(...),
    issue_date: str = Form(...),
    maturity_date: str = Form(...),
    interest_rate_pct: str = Form("7.25"),
    holder_names: str | None = Form(None),
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY)),
):
    """Submit a new FDR instrument with scanned document (multipart)."""
    data = file.file.read()
    validate_pdf(data, file.filename or "")
    entered = {
        "fdr_number": fdr_number,
        "bank_ifsc": bank_ifsc,
        "principal_paise": principal_paise,
        "issue_date": issue_date,
        "maturity_date": maturity_date,
        "interest_rate_pct": interest_rate_pct,
    }
    if holder_names:
        entered["holder_names"] = holder_names
    db = SessionLocal()
    try:
        detail = submit_instrument(
            db, institute_id=current_user.institute_id, actor=current_user,
            obligation_id=obligation_id, filename=file.filename or "document.pdf",
            data=data, entered=entered,
        )
        db.commit()
        return detail
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.get("/instruments", response_model=InstrumentListResponse)
def list_instruments(
    state: InstrumentState | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """List instruments, optionally filtered by state."""
    # TODO PY-2b: replace stub
    items = list(_MOCK_INSTRUMENTS.values())
    if current_user.institute_id:
        items = [i for i in items if i.institute_id == current_user.institute_id]
    if state is not None:
        items = [i for i in items if i.state == state]
    return InstrumentListResponse(items=items, total=len(items))


@router.get("/instruments/{instrument_id}", response_model=InstrumentDetail)
def get_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """Retrieve full instrument workspace with trust-annotated fields."""
    # TODO PY-2b: replace stub
    inst = _MOCK_INSTRUMENTS.get(instrument_id)
    if not inst:
        raise NotFoundError("Instrument", instrument_id)
    is_takshashila = inst.id == _MOCK_INST_TAKSHASHILA.id
    fields = _TAKSHASHILA_FIELDS if is_takshashila else _ARYABHATTA_FIELDS
    return InstrumentDetail(
        id=inst.id,
        obligation_id=inst.obligation_id,
        institute_id=inst.institute_id,
        bank_id=inst.bank_id,
        state=inst.state,
        is_quarantined=inst.is_quarantined,
        fields=fields,
        versions=[InstrumentVersion(version_no=1, fields_json={f.name: f.value for f in fields}, created_at=_NOW)],
        documents=[{"id": "doc-arya-scan-001", "filename": "fdr_genuine_aryabhatta.pdf", "uploaded_at": _NOW}],
        doc_checks=[
            DocCheck(name="tamper_detection", outcome=DocCheckOutcome.PASS, confidence=0.97, details="Clean"),
            DocCheck(name="metadata_intact", outcome=DocCheckOutcome.PASS, confidence=0.98, details="OK"),
        ],
        discrepancies=[] if is_takshashila else [_MOCK_DISCREPANCY],
        bank_requests=[
            BankRequestSummary(id="breq-tak-001", state=BankRequestState.CONFIRMED, outcome="ALL_CLEAR", created_at=_NOW)
        ] if is_takshashila else [],
        obligation=ObligationSummary(
            id=inst.obligation_id,
            programme="AICTE FDR obligation",
            required_paise=450000000,
            state=ObligationState.COVERED if is_takshashila else ObligationState.PENDING_DEPOSIT,
        ),
        created_at=_NOW,
    )


@router.get("/instruments/{instrument_id}/timeline", response_model=list[TimelineEvent])
def get_instrument_timeline(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """Return state-transition timeline for an instrument."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    return [
        TimelineEvent(from_state=None, to_state="SUBMITTED", actor_id="ar_sig", reason="Initial upload", at=_NOW),
        TimelineEvent(from_state="SUBMITTED", to_state="AUTO_CHECKING", actor_id="system", reason="Pipeline triggered", at=_NOW),
    ]


@router.get("/instruments/{instrument_id}/document")
def get_instrument_document(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_VIEW_ROLES)),
):
    """Download the scanned FDR PDF for an instrument."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    pdf_path = Path(__file__).resolve().parents[4] / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
    if not pdf_path.exists():
        raise NotFoundError("Document", "file missing")
    return FileResponse(pdf_path, media_type="application/pdf", filename="fdr_genuine_aryabhatta.pdf")


@router.get("/discrepancies", response_model=DiscrepancyListResponse)
def list_discrepancies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_SCRUTINY_ROLES, Role.COMPLIANCE_OFFICER)),
):
    """List open discrepancies across instruments."""
    # TODO PY-2b: replace stub
    return DiscrepancyListResponse(items=[_MOCK_DISCREPANCY], total=1)


@router.post("/discrepancies/{discrepancy_id}/resolve", response_model=DiscrepancyOut)
def resolve_discrepancy(
    discrepancy_id: str,
    payload: DiscrepancyResolveRequest,
    current_user: User = Depends(require_roles(*_SCRUTINY_ROLES)),
):
    """Resolve a discrepancy: CLEAR, ESCALATE, or REJECT."""
    # TODO PY-2b: replace stub
    valid_actions = {"CLEAR", "ESCALATE", "REJECT"}
    if payload.action not in valid_actions:
        raise ValidationError(
            f"Invalid action '{payload.action}'; must be one of {sorted(valid_actions)}",
            details={"allowed": sorted(valid_actions)},
        )
    status_map = {"CLEAR": DiscrepancyStatus.CLEARED, "ESCALATE": DiscrepancyStatus.ESCALATED, "REJECT": DiscrepancyStatus.REJECTED}
    return _MOCK_DISCREPANCY.model_copy(update={
        "status": status_map[payload.action],
        "resolved_at": _NOW,
        "resolved_by": current_user.id,
        "resolution_note": payload.note,
    })


@router.post("/instruments/{instrument_id}/quarantine", response_model=InstrumentActionResponse)
def quarantine_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.COMPLIANCE_OFFICER, Role.SYSTEM_ADMIN)),
):
    """Place instrument under quarantine for vigilance review."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    return InstrumentActionResponse(
        id=instrument_id, state=InstrumentState.SCRUTINY, is_quarantined=True, message="Instrument quarantined",
    )


@router.post("/instruments/{instrument_id}/reject", response_model=InstrumentActionResponse)
def reject_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.SYSTEM_ADMIN)),
):
    """Reject an instrument after scrutiny failure."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    return InstrumentActionResponse(
        id=instrument_id, state=InstrumentState.REJECTED, is_quarantined=False, message="Instrument rejected",
    )


@router.post("/instruments/{instrument_id}/renew", response_model=InstrumentActionResponse)
def renew_instrument(
    instrument_id: str,
    payload: InstrumentRenewRequest,
    current_user: User = Depends(require_roles(*_INTAKE_WRITE_ROLES)),
):
    """Initiate renewal of a maturing instrument."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    new_mat = payload.new_maturity_date or "2028-10-24"
    return InstrumentActionResponse(
        id=instrument_id, state=InstrumentState.RENEWAL_DUE, is_quarantined=False,
        message=f"Renewal initiated until {new_mat}",
    )


@router.post("/instruments/{instrument_id}/activate", response_model=InstrumentActionResponse)
def activate_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.SYSTEM_ADMIN)),
    stepped_up: User = Depends(require_step_up),
):
    """Activate instrument after successful scrutiny (requires step-up)."""
    # TODO PY-2b: replace stub
    if instrument_id not in _MOCK_INSTRUMENTS:
        raise NotFoundError("Instrument", instrument_id)
    return InstrumentActionResponse(
        id=instrument_id, state=InstrumentState.ACTIVE, is_quarantined=False, message="Instrument activated",
    )
