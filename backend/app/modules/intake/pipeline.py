"""Submission pipeline for intake instruments."""
from pathlib import Path
from uuid import uuid4

from app.core import clock, policy
from app.core.enums import DocCheckOutcome, InstrumentState, Severity, TrustLevel
from app.core.errors import NotFoundError, ValidationError
from app.modules.bank.models import Bank, BankRequest
from app.modules.intake import service
from app.modules.intake.models import (
    DocCheck,
    Document,
    FieldTrust,
    Instrument,
    InstrumentVersion,
    Trust,
)
from app.modules.intake.schemas import (
    BankRequestSummary,
    DiscrepancyOut,
    InstrumentDetail,
    InstrumentField,
    ObligationSummary,
)
from app.modules.intake.schemas import (
    DocCheck as DocCheckSchema,
)
from app.modules.intake.schemas import (
    InstrumentVersion as InstrumentVersionSchema,
)
from app.modules.intake.security import fingerprint
from app.modules.intake.uploads import save_document
from doc_intel import analyze
from sqlalchemy.orm import Session


def submit_instrument(
    db: Session, *, institute_id: str, actor, obligation_id: str, filename: str,
    data: bytes, entered: dict, supersedes_id: str | None = None,
) -> InstrumentDetail:
    obligation = service.get_obligation(obligation_id, db)
    if not obligation or obligation.institute_id != institute_id:
        raise NotFoundError("Obligation", obligation_id)
    # OCR/manual input can contain whitespace or lower-case characters. Store a
    # canonical IFSC before selecting the authorised bank directory entry.
    entered["bank_ifsc"] = str(entered["bank_ifsc"]).strip().upper()
    prefix = entered["bank_ifsc"][:4]
    bank = db.query(Bank).filter(Bank.ifsc_prefix == prefix).first()
    if not bank:
        allowed_prefixes = [row[0] for row in db.query(Bank.ifsc_prefix).order_by(Bank.ifsc_prefix).all()]
        raise ValidationError(
            f"Unknown bank IFSC prefix '{prefix}'. Use a registered IFSC beginning with {', '.join(allowed_prefixes)}.",
            details={"prefix": prefix, "allowed_prefixes": allowed_prefixes},
        )

    fdr_fingerprint = fingerprint(entered["fdr_number"], bank.id)
    duplicate = (
        db.query(Instrument).filter(
            Instrument.fdr_fingerprint == fdr_fingerprint,
            Instrument.obligation_id != obligation_id,
            Instrument.state != InstrumentState.REJECTED.value,
        ).first()
    )
    instrument_id = str(uuid4())
    saved_path, digest = save_document(instrument_id, data)
    # Resolve the required backend root from this module. The shared helper is
    # retained as the hash/storage entry point; normalize its path for this API.
    backend_root = Path(__file__).resolve().parents[3]
    path = (backend_root / "data" / "files" / instrument_id / f"{digest}.pdf").resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as output:
            output.write(data)
    except FileExistsError:
        if path.read_bytes() != data:
            raise
    if saved_path != path and saved_path.exists():
        saved_path.unlink()
    now = clock.now()
    document_id = str(uuid4())
    instrument = Instrument(
        id=instrument_id, obligation_id=obligation.id, institute_id=institute_id,
        bank_id=bank.id, state=InstrumentState.SUBMITTED.value, is_quarantined=False,
        supersedes_id=supersedes_id,
        # The existing column has a unique DB constraint. Keep the computed value
        # for first submissions; a detected duplicate is represented by D-05.
        fdr_fingerprint=None if duplicate else fdr_fingerprint,
        created_by=actor.id, created_at=now,
    )
    document = Document(
        id=document_id, instrument_id=instrument_id, filename=filename[:255],
        path=str(path), sha256=digest, size_bytes=len(data), uploaded_by=actor.id,
        uploaded_at=now,
    )
    db.add_all([instrument, document])
    db.flush()
    for name, value in entered.items():
        db.add(FieldTrust(
            id=str(uuid4()), instrument_id=instrument_id, field_name=name,
            value=str(value), trust=TrustLevel.L0_CLAIMED.value, source="ENTERED",
            evidence_ref=document_id, set_at=now,
        ))
    db.add(InstrumentVersion(
        id=str(uuid4()), instrument_id=instrument_id, version_no=1,
        fields_json={key: str(value) for key, value in entered.items()},
        document_id=document_id, created_at=now,
    ))
    service.transition(instrument_id, InstrumentState.AUTO_CHECKING, actor, "Submission pipeline started", db)
    result = analyze(data, entered, policy.get("favouring_names"))
    for check in result.get("checks", []):
        db.add(DocCheck(
            id=str(uuid4()), document_id=document_id, name=check["name"],
            outcome=check.get("outcome", DocCheckOutcome.ERROR.value),
            confidence=check.get("confidence") or 0.0, details=check.get("details"),
        ))
    service.transition(instrument_id, InstrumentState.SCRUTINY, actor, "Automated checks completed", db)

    severity = {"D-07": Severity.HIGH, "D-10": Severity.MEDIUM,
                "D-11": Severity.HIGH, "D-12": Severity.MEDIUM}
    for code in result.get("flags", []):
        if code in severity:
            service.add_discrepancy(instrument_id, code, severity[code], {"source": "doc_intel"}, db)
    if duplicate:
        service.add_discrepancy(instrument_id, "D-05", Severity.HIGH,
                                {"source": "fingerprint", "message": "Matching instrument exists on another obligation"}, db)
    issue = service.parse_date(entered.get("issue_date"))
    maturity = service.parse_date(entered.get("maturity_date"))
    if issue and issue > now.date():
        service.add_discrepancy(instrument_id, "D-08", Severity.HIGH, {"issue_date": str(issue)}, db)
    if issue and maturity and maturity < issue:
        service.add_discrepancy(instrument_id, "D-09", Severity.HIGH,
                                {"issue_date": str(issue), "maturity_date": str(maturity)}, db)
    try:
        short_principal = int(entered["principal_paise"]) < obligation.required_paise
    except (KeyError, TypeError, ValueError):
        short_principal = False
    if short_principal:
        service.add_discrepancy(instrument_id, "D-01", Severity.MEDIUM,
                                {"required_paise": obligation.required_paise}, db)
    trust = db.query(Trust).filter(Trust.id == obligation.trust_id).first()
    holder = str(entered.get("holder_names", "")).casefold()
    if trust and trust.name.casefold() not in holder:
        service.add_discrepancy(instrument_id, "D-06", Severity.MEDIUM,
                                {"message": "Holder name does not include the obligation trust"}, db)
    service.recompute_coverage(obligation_id, db)
    db.flush()

    fields = db.query(FieldTrust).filter(FieldTrust.instrument_id == instrument_id).all()
    versions = db.query(InstrumentVersion).filter(InstrumentVersion.instrument_id == instrument_id).all()
    discrepancies = instrument.discrepancies
    checks = document.checks
    requests = db.query(BankRequest).filter(BankRequest.instrument_id == instrument_id).all()
    return InstrumentDetail(
        id=instrument.id, obligation_id=obligation.id, institute_id=institute_id,
        bank_id=bank.id, state=InstrumentState.SCRUTINY, is_quarantined=False,
        fields=[InstrumentField(name=f.field_name, value=f.value or "", trust=f.trust,
                                source=f.source or "", evidence_ref=f.evidence_ref,
                                set_at=f.set_at.isoformat()) for f in fields],
        versions=[InstrumentVersionSchema(version_no=v.version_no, fields_json=v.fields_json,
                                           document_id=v.document_id, created_at=v.created_at.isoformat()) for v in versions],
        documents=[{"id": document.id, "filename": document.filename, "uploaded_at": document.uploaded_at.isoformat(),
                    "sha256": document.sha256}],
        doc_checks=[DocCheckSchema(name=c.name, outcome=c.outcome, confidence=c.confidence, details=c.details) for c in checks],
        discrepancies=[DiscrepancyOut(id=d.id, instrument_id=d.instrument_id, code=d.code,
                                      severity=d.severity, status=d.status, details=d.details_json,
                                      created_at=d.created_at.isoformat()) for d in discrepancies],
        bank_requests=[BankRequestSummary(id=r.id, state=r.state, outcome=r.outcome,
                                          created_at=r.created_at.isoformat()) for r in requests],
        obligation=ObligationSummary(id=obligation.id, programme=obligation.programme,
                                     required_paise=obligation.required_paise, state=obligation.state),
        created_at=instrument.created_at.isoformat(),
    )
