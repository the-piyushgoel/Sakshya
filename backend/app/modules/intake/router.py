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
import re
from pathlib import Path

from app.core import audit, notify, sod
from app.core.db import SessionLocal
from app.core.deps import require_roles, require_step_up
from app.core.enums import (
    DiscrepancyStatus,
    DocCheckOutcome,
    InstrumentState,
    ObligationState,
    Role,
    Severity,
    TrustLevel,
)
from app.core.errors import (
    InvalidStateError,
    NotFoundError,
    SakshyaError,
    ValidationError,
)
from app.core.models import User
from app.modules.bank.models import BankRequest
from app.modules.intake import service
from app.modules.intake.ids import bank_id, institute_id, stable_id
from app.modules.intake.models import (
    Discrepancy,
    Document,
    FieldTrust,
    Institute,
    Instrument,
    InstrumentStateHistory,
    Obligation,
)
from app.modules.intake.models import (
    DocCheck as DocCheckModel,
)
from app.modules.intake.models import (
    InstrumentVersion as InstrumentVersionModel,
)
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
    InstrumentVersion,
    ObligationListResponse,
    ObligationOut,
    ObligationSummary,
    TimelineEvent,
)
from app.modules.intake.uploads import validate_pdf
from doc_intel import analyze
from fastapi import APIRouter, Body, Depends, File, Form, Query, UploadFile
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

_INTAKE_READ_ROLES = [*_INTAKE_VIEW_ROLES, Role.RELEASE_AUTHORITY, Role.FINANCE_OFFICER]

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

def _is_institute_user(user: User) -> bool:
    return any(role in user.roles for role in (Role.INS_SIGNATORY.value, Role.INS_ADMIN.value))


def _obligation_out(db, obligation: Obligation) -> ObligationOut:
    instruments = db.query(Instrument).filter(Instrument.obligation_id == obligation.id).all()
    covered = 0
    for instrument in instruments:
        if not instrument.is_quarantined and instrument.state in {
            InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value,
        }:
            principal = service.get_field_value(instrument, "principal_paise", db)
            try:
                covered += int(principal or 0)
            except ValueError:
                continue
    return ObligationOut(
        id=obligation.id, institute_id=obligation.institute_id, trust_id=obligation.trust_id or "",
        programme=obligation.programme, required_paise=obligation.required_paise,
        term_years=obligation.term_years, start_date=obligation.start_date.isoformat(),
        end_date=obligation.end_date.isoformat(), state=obligation.state,
        covered_paise=covered, instruments_count=len(instruments),
    )


def _instrument_out(db, instrument: Instrument) -> InstrumentOut:
    return InstrumentOut(
        id=instrument.id, obligation_id=instrument.obligation_id,
        institute_id=instrument.institute_id, bank_id=instrument.bank_id,
        state=instrument.state, is_quarantined=instrument.is_quarantined,
        fdr_number=service.get_field_value(instrument, "fdr_number", db),
        principal_paise=_int_or_none(service.get_field_value(instrument, "principal_paise", db)),
        maturity_date=service.get_field_value(instrument, "maturity_date", db),
        created_at=instrument.created_at.isoformat(),
    )


def _int_or_none(value: str | None) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _scoped_instrument(db, instrument_id: str, user: User) -> Instrument:
    instrument = db.query(Instrument).filter(Instrument.id == instrument_id).first()
    if not instrument or _is_institute_user(user) and instrument.institute_id != user.institute_id:
        raise NotFoundError("Instrument", instrument_id)
    return instrument


def _redact_names(value, names: list[str]):
    if isinstance(value, dict):
        return {key: _redact_names(item, names) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_names(item, names) for item in value]
    if isinstance(value, str):
        for name in names:
            if name and name.casefold() in value.casefold():
                value = re.sub(re.escape(name), "[redacted]", value, flags=re.IGNORECASE)
        return value
    return value


@router.get("/institutes/me", response_model=InstituteOut)
def get_my_institute(
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY, Role.INS_ADMIN, Role.SYSTEM_ADMIN)),
):
    """Return the institute profile for the current user."""
    if not current_user.institute_id:
        raise NotFoundError("Institute", "current user has no institute")
    db = SessionLocal()
    try:
        institute = service.get_institute(current_user.institute_id, db)
        if not institute:
            raise NotFoundError("Institute", current_user.institute_id)
        return InstituteOut(id=institute.id, name=institute.name, code=institute.code,
                            city=institute.city or "")
    finally:
        db.close()


@router.get("/obligations", response_model=ObligationListResponse)
def list_obligations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """List FDR obligations for the user's institute (or all for officers)."""
    scoped_id = current_user.institute_id if any(
        role in current_user.roles for role in (Role.INS_SIGNATORY.value, Role.INS_ADMIN.value)
    ) else None
    db = SessionLocal()
    try:
        obligations = service.list_obligations(db, scoped_id)
        total = len(obligations)
        page_items = obligations[(page - 1) * page_size:page * page_size]
        return ObligationListResponse(items=[_obligation_out(db, item) for item in page_items], total=total)
    finally:
        db.close()


@router.get("/obligations/{obligation_id}")
def get_obligation(
    obligation_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """Get a single obligation by ID."""
    db = SessionLocal()
    try:
        obligation = service.get_obligation(obligation_id, db)
        if not obligation or _is_institute_user(current_user) and obligation.institute_id != current_user.institute_id:
            raise NotFoundError("Obligation", obligation_id)
        result = _obligation_out(db, obligation).model_dump()
        result["institute_name"] = obligation.institute.name
        return result
    finally:
        db.close()


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
    favouring: str | None = Form(None),
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
    if favouring:
        entered["favouring"] = favouring
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
    obligation_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """List instruments, optionally filtered by state."""
    db = SessionLocal()
    try:
        rows = service.list_instruments(
            db, current_user.institute_id if _is_institute_user(current_user) else None,
            state.value if state else None, obligation_id,
        )
        total = len(rows)
        rows = rows[(page - 1) * page_size:page * page_size]
        return InstrumentListResponse(items=[_instrument_out(db, row) for row in rows], total=total)
    finally:
        db.close()


@router.get("/instruments/{instrument_id}", response_model=InstrumentDetail)
def get_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """Retrieve full instrument workspace with trust-annotated fields."""
    db = SessionLocal()
    try:
        inst = _scoped_instrument(db, instrument_id, current_user)
        obligation = db.query(Obligation).filter(Obligation.id == inst.obligation_id).first()
        fields = db.query(FieldTrust).filter(FieldTrust.instrument_id == inst.id).order_by(FieldTrust.field_name).all()
        versions = db.query(InstrumentVersionModel).filter(
            InstrumentVersionModel.instrument_id == inst.id,
        ).order_by(InstrumentVersionModel.version_no).all()
        documents = db.query(Document).filter(Document.instrument_id == inst.id).order_by(Document.uploaded_at).all()
        document_ids = [doc.id for doc in documents]
        checks = db.query(DocCheckModel).filter(DocCheckModel.document_id.in_(document_ids)).order_by(DocCheckModel.id).all() if document_ids else []
        discrepancies = db.query(Discrepancy).filter(Discrepancy.instrument_id == inst.id).order_by(Discrepancy.created_at).all()
        bank_requests = db.query(BankRequest).filter(BankRequest.instrument_id == inst.id).order_by(BankRequest.created_at).all()
        disc_details = [d.details_json for d in discrepancies]
        if _is_institute_user(current_user):
            other_names = [name for (name,) in db.query(Institute.name).filter(Institute.id != inst.institute_id).all()]
            disc_details = [_redact_names(value, other_names) for value in disc_details]
        return InstrumentDetail(
            id=inst.id, obligation_id=inst.obligation_id, institute_id=inst.institute_id,
            bank_id=inst.bank_id, state=inst.state, is_quarantined=inst.is_quarantined,
            fields=[InstrumentField(name=f.field_name, value=f.value or "", trust=f.trust,
                                    source=f.source or "", evidence_ref=f.evidence_ref,
                                    set_at=f.set_at.isoformat()) for f in fields],
            versions=[InstrumentVersion(version_no=v.version_no, fields_json=v.fields_json,
                                        document_id=v.document_id, created_at=v.created_at.isoformat()) for v in versions],
            documents=[{"id": doc.id, "filename": doc.filename, "uploaded_at": doc.uploaded_at.isoformat(),
                        "sha256": doc.sha256} for doc in documents],
            doc_checks=[DocCheck(name=c.name, outcome=c.outcome, confidence=c.confidence, details=c.details) for c in checks],
            discrepancies=[DiscrepancyOut(id=d.id, instrument_id=d.instrument_id, code=d.code,
                severity=d.severity, status=d.status, details=details, created_at=d.created_at.isoformat(),
                resolved_by=d.resolved_by, resolution_note=d.resolution_note) for d, details in zip(discrepancies, disc_details)],
            bank_requests=[BankRequestSummary(id=r.id, state=r.state, outcome=r.outcome,
                created_at=r.created_at.isoformat()) for r in bank_requests],
            obligation=ObligationSummary(id=obligation.id, programme=obligation.programme,
                required_paise=obligation.required_paise, state=obligation.state) if obligation else None,
            created_at=inst.created_at.isoformat(),
        )
    finally:
        db.close()


@router.get("/instruments/{instrument_id}/timeline", response_model=list[TimelineEvent])
def get_instrument_timeline(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """Return state-transition timeline for an instrument."""
    db = SessionLocal()
    try:
        _scoped_instrument(db, instrument_id, current_user)
        rows = db.query(InstrumentStateHistory).filter(
            InstrumentStateHistory.instrument_id == instrument_id,
        ).order_by(InstrumentStateHistory.at, InstrumentStateHistory.id).all()
        return [TimelineEvent(from_state=row.from_state, to_state=row.to_state,
                              actor_id=row.actor_id or "", reason=row.reason,
                              at=row.at.isoformat()) for row in rows]
    finally:
        db.close()


@router.get("/instruments/{instrument_id}/document")
def get_instrument_document(
    instrument_id: str,
    current_user: User = Depends(require_roles(*_INTAKE_READ_ROLES)),
):
    """Download the scanned FDR PDF for an instrument."""
    db = SessionLocal()
    try:
        _scoped_instrument(db, instrument_id, current_user)
        document = db.query(Document).filter(Document.instrument_id == instrument_id).order_by(Document.uploaded_at).first()
        if not document or not Path(document.path).is_file():
            raise NotFoundError("Document", instrument_id)
        return FileResponse(document.path, media_type="application/pdf", filename=document.filename)
    finally:
        db.close()


@router.get("/discrepancies", response_model=DiscrepancyListResponse)
def list_discrepancies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles(*_SCRUTINY_ROLES, Role.COMPLIANCE_OFFICER)),
):
    """List persisted unresolved discrepancies for the officer work queue."""
    db = SessionLocal()
    try:
        query = db.query(Discrepancy).filter(
            Discrepancy.status.in_((
                DiscrepancyStatus.OPEN.value,
                DiscrepancyStatus.ESCALATED.value,
            )),
        ).order_by(Discrepancy.created_at.desc(), Discrepancy.id)
        total = query.count()
        rows = query.offset((page - 1) * page_size).limit(page_size).all()
        return DiscrepancyListResponse(
            items=[
                DiscrepancyOut(
                    id=row.id,
                    instrument_id=row.instrument_id,
                    code=row.code,
                    severity=row.severity,
                    status=row.status,
                    details=row.details_json,
                    created_at=row.created_at.isoformat(),
                    resolved_by=row.resolved_by,
                    resolution_note=row.resolution_note,
                )
                for row in rows
            ],
            total=total,
        )
    finally:
        db.close()


@router.post("/discrepancies/{discrepancy_id}/resolve", response_model=DiscrepancyOut)
def resolve_discrepancy(
    discrepancy_id: str,
    payload: DiscrepancyResolveRequest,
    current_user: User = Depends(require_roles(Role.SCRUTINY_OFFICER, Role.APPROVING_OFFICER)),
):
    """Resolve a discrepancy: CLEAR, ESCALATE, or REJECT."""
    valid_actions = {"CLEAR", "ESCALATE", "REJECT"}
    if payload.action not in valid_actions:
        raise ValidationError(
            f"Invalid action '{payload.action}'; must be one of {sorted(valid_actions)}",
            details={"allowed": sorted(valid_actions)},
        )
    status_map = {
        "CLEAR": DiscrepancyStatus.CLEARED,
        "ESCALATE": DiscrepancyStatus.ESCALATED,
        "REJECT": DiscrepancyStatus.REJECTED,
    }
    db = SessionLocal()
    try:
        discrepancy = db.query(Discrepancy).filter(Discrepancy.id == discrepancy_id).first()
        if not discrepancy:
            raise NotFoundError("Discrepancy", discrepancy_id)
        if discrepancy.status not in (DiscrepancyStatus.OPEN.value, DiscrepancyStatus.ESCALATED.value):
            raise InvalidStateError("Discrepancy has already been resolved")
        if discrepancy.severity == Severity.HIGH.value and not payload.note.strip():
            raise ValidationError("A resolution note is required for HIGH discrepancies")
        instrument = db.query(Instrument).filter(Instrument.id == discrepancy.instrument_id).first()
        if not instrument:
            raise NotFoundError("Instrument", discrepancy.instrument_id)

        discrepancy.status = status_map[payload.action].value
        discrepancy.resolved_by = current_user.id
        discrepancy.resolution_note = payload.note
        if Role.SCRUTINY_OFFICER.value in current_user.roles and not instrument.scrutiny_officer_id:
            instrument.scrutiny_officer_id = current_user.id
        audit.log(
            actor=current_user, action="DISCREPANCY_RESOLVED", entity_type="DISCREPANCY",
            entity_id=discrepancy.id,
            payload={"action": payload.action, "status": discrepancy.status, "note": payload.note},
            db=db,
        )
        if instrument.state == InstrumentState.DISCREPANCY.value and not service.has_open_high(instrument.id, db):
            service.transition(instrument.id, InstrumentState.SCRUTINY, current_user,
                               "All HIGH discrepancies resolved", db)
        db.commit()
        db.refresh(discrepancy)
        return DiscrepancyOut(
            id=discrepancy.id, instrument_id=discrepancy.instrument_id, code=discrepancy.code,
            severity=discrepancy.severity, status=discrepancy.status,
            details=discrepancy.details_json, created_at=discrepancy.created_at.isoformat(),
            resolved_by=discrepancy.resolved_by, resolution_note=discrepancy.resolution_note,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/instruments/{instrument_id}/quarantine", response_model=InstrumentActionResponse)
def quarantine_instrument(
    instrument_id: str,
    reason: str = Body(..., embed=True),
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER, Role.COMPLIANCE_OFFICER)),
):
    """Place instrument under quarantine for vigilance review."""
    if not reason.strip():
        raise ValidationError("A quarantine reason is required")
    db = SessionLocal()
    try:
        instrument = db.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        if instrument.is_quarantined:
            raise InvalidStateError("Instrument is already quarantined")
        instrument.is_quarantined = True
        audit.log(
            actor=current_user, action="INSTRUMENT_QUARANTINED", entity_type="INSTRUMENT",
            entity_id=instrument.id, payload={"reason": reason}, db=db,
        )
        notify.send(
            title="QUARANTINE_VIGILANCE: instrument quarantined",
            body=f"Instrument {instrument.id} was quarantined: {reason}",
            role=Role.COMPLIANCE_OFFICER, level="ERROR",
            link=f"/instruments/{instrument.id}", db=db,
        )
        db.commit()
        return InstrumentActionResponse(
            id=instrument.id, state=instrument.state, is_quarantined=True, message="Instrument quarantined",
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/instruments/{instrument_id}/reject", response_model=InstrumentActionResponse)
def reject_instrument(
    instrument_id: str,
    reason: str = Body(..., embed=True),
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER)),
):
    """Reject an instrument after scrutiny failure."""
    if not reason.strip():
        raise ValidationError("A rejection reason is required")
    db = SessionLocal()
    try:
        instrument = db.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        rejectable_states = {
            InstrumentState.SUBMITTED.value, InstrumentState.AUTO_CHECKING.value,
            InstrumentState.SCRUTINY.value, InstrumentState.BANK_PENDING.value,
            InstrumentState.DISCREPANCY.value, InstrumentState.CHANGES_REQUESTED.value,
        }
        if instrument.state not in rejectable_states:
            raise InvalidStateError(f"Cannot reject instrument from {instrument.state} state")
        service.transition(instrument.id, InstrumentState.REJECTED, current_user, reason, db)
        db.commit()
        return InstrumentActionResponse(
            id=instrument.id, state=instrument.state, is_quarantined=instrument.is_quarantined,
            message="Instrument rejected",
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/instruments/{instrument_id}/renew", response_model=InstrumentDetail)
def renew_instrument(
    instrument_id: str,
    file: UploadFile = File(...),
    mode: str = Form(...),
    fdr_number: str = Form(...),
    bank_ifsc: str = Form(...),
    principal_paise: int = Form(...),
    issue_date: str = Form(...),
    maturity_date: str = Form(...),
    interest_rate_pct: str = Form("7.25"),
    favouring: str | None = Form(None),
    holder_names: str | None = Form(None),
    current_user: User = Depends(require_roles(Role.INS_SIGNATORY)),
):
    """Submit a same-number or replacement-number renewal for re-verification."""
    if mode not in {"SAME_NUMBER", "NEW_NUMBER"}:
        raise ValidationError("mode must be SAME_NUMBER or NEW_NUMBER")
    data = file.file.read()
    validate_pdf(data, file.filename or "")
    entered = {
        "fdr_number": fdr_number, "bank_ifsc": bank_ifsc,
        "principal_paise": principal_paise, "issue_date": issue_date,
        "maturity_date": maturity_date, "interest_rate_pct": interest_rate_pct,
    }
    if holder_names:
        entered["holder_names"] = holder_names
    if favouring:
        entered["favouring"] = favouring
    db = SessionLocal()
    try:
        predecessor = service.get_instrument(instrument_id, db)
        if not predecessor or predecessor.institute_id != current_user.institute_id:
            raise NotFoundError("Instrument", instrument_id)
        predecessor = service.ensure_not_quarantined(instrument_id, db)
        if predecessor.state not in {
            InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value,
            InstrumentState.LAPSED.value,
        }:
            raise InvalidStateError("Only ACTIVE, RENEWAL_DUE, or LAPSED instruments can be renewed")
        terminal_states = {
            InstrumentState.REJECTED.value, InstrumentState.CLOSED.value,
            InstrumentState.SUPERSEDED.value,
        }
        open_successor = db.query(Instrument).filter(
            Instrument.supersedes_id == predecessor.id,
            ~Instrument.state.in_(terminal_states),
        ).first()
        if open_successor:
            raise InvalidStateError("An open renewal successor already exists")
        old_fields = service.get_fields(predecessor.id, db)
        old_number = old_fields.get("fdr_number", {}).get("value")
        old_maturity = service.parse_date(old_fields.get("maturity_date", {}).get("value"))
        new_maturity = service.parse_date(maturity_date)
        if mode == "NEW_NUMBER" and fdr_number == old_number:
            raise ValidationError("New FDR number must differ from predecessor")
        if mode == "SAME_NUMBER" and fdr_number != old_number:
            raise ValidationError("Same-number renewal must retain the predecessor FDR number")
        if not old_maturity or not new_maturity or new_maturity <= old_maturity:
            raise ValidationError("New maturity date must be after predecessor maturity date")

        detail = submit_instrument(
            db, institute_id=predecessor.institute_id, actor=current_user,
            obligation_id=predecessor.obligation_id, filename=file.filename or "document.pdf",
            data=data, entered=entered, supersedes_id=predecessor.id,
        )
        db.add(InstrumentStateHistory(
            id=stable_id("history", f"renewal-started:{detail.id}"),
            instrument_id=predecessor.id, from_state=predecessor.state,
            to_state=predecessor.state, actor_id=current_user.id,
            reason=f"{mode} renewal started with successor {detail.id}", at=service.clock.now(),
        ))
        audit.log(
            actor=current_user, action="renewal_started", entity_type="INSTRUMENT",
            entity_id=predecessor.id, payload={"successor_id": detail.id, "mode": mode}, db=db,
        )
        db.commit()
        return detail
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@router.post("/instruments/{instrument_id}/activate", response_model=InstrumentDetail)
def activate_instrument(
    instrument_id: str,
    current_user: User = Depends(require_roles(Role.APPROVING_OFFICER)),
    stepped_up: User = Depends(require_step_up),
):
    """Activate an L2-confirmed instrument after scrutiny and maker-checker guards."""
    db = SessionLocal()
    try:
        instrument = service.get_instrument(instrument_id, db)
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        instrument = service.ensure_not_quarantined(instrument_id, db)
        if instrument.state != InstrumentState.SCRUTINY.value:
            raise InvalidStateError("Only an instrument in SCRUTINY can be activated")

        predecessor = None
        if instrument.supersedes_id:
            predecessor = service.get_instrument(instrument.supersedes_id, db)
            if not predecessor or predecessor.state not in {
                InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value,
                InstrumentState.LAPSED.value,
            }:
                raise InvalidStateError("Renewal predecessor cannot be superseded from its current state")
            try:
                from app.modules.release.service import get_active_hold
            except ImportError:
                get_active_hold = None
            if get_active_hold and get_active_hold("INSTRUMENT", instrument.id, db=db):
                raise InvalidStateError("An active hold blocks renewal activation")

        fields = service.get_fields(instrument_id, db)
        required_l2 = ("principal_paise", "maturity_date", "favouring", "lien_marked")
        missing = [name for name in required_l2 if fields.get(name, {}).get("trust") != TrustLevel.L2_BANK_CONFIRMED.value]
        if fields.get("lien_marked", {}).get("value", "").casefold() != "true":
            missing.append("lien_marked=true")
        if missing:
            raise SakshyaError("INVALID_STATE", "Required bank-confirmed fields are missing", 409,
                               details={"missing_fields": missing})

        if service.has_open_high(instrument_id, db):
            high_rows = db.query(Discrepancy.code).filter(
                Discrepancy.instrument_id == instrument_id,
                Discrepancy.severity == Severity.HIGH.value,
                Discrepancy.status.in_((DiscrepancyStatus.OPEN.value, DiscrepancyStatus.ESCALATED.value)),
            ).distinct().all()
            raise SakshyaError("INVALID_STATE", "Open HIGH discrepancies block activation", 409,
                               details={"discrepancy_codes": sorted(code for (code,) in high_rows)})

        sod.ensure_different(current_user, instrument.scrutiny_officer_id,
                             "Approving officer cannot activate an instrument they scrutinised")
        service.transition(instrument_id, InstrumentState.ACTIVE, current_user, "Approving officer activated instrument", db)
        if predecessor:
            service.transition(
                predecessor.id, InstrumentState.SUPERSEDED, current_user,
                f"Superseded by renewal {instrument_id}", db,
            )
            notify.send(
                title="FDR instrument superseded",
                body=f"Instrument {predecessor.id} was superseded by {instrument_id}.",
                role=Role.INS_SIGNATORY, institute_id=predecessor.institute_id,
                level="INFO", link=f"/instruments/{predecessor.id}",
                dedupe_key=f"instrument:{predecessor.id}:superseded:{instrument_id}", db=db,
            )
        service.recompute_coverage(instrument.obligation_id, db)
        obligation = service.recompute_confirmed_coverage(instrument.obligation_id, db)
        notify.send(
            title="FDR instrument activated", body=f"Instrument {instrument_id} is now ACTIVE.",
            role=Role.INS_SIGNATORY, institute_id=instrument.institute_id,
            level="INFO", link=f"/instruments/{instrument_id}",
            dedupe_key=f"instrument:{instrument_id}:activated", db=db,
        )
        audit.log(actor=current_user, action="INSTRUMENT_ACTIVATED", entity_type="INSTRUMENT",
                  entity_id=instrument_id,
                  payload={"obligation_id": obligation.id, "coverage_state": obligation.state}, db=db)
        db.commit()
        return get_instrument(instrument_id, current_user)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
