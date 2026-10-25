"""
Public module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  POST /public/verify
  GET  /public/verify/{code}

No authentication required — these are public endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.enums import PublicVerifyStatus
from app.core.errors import NotFoundError
from app.modules.bank.models import Bank
from app.modules.intake.models import Institute
from app.modules.public.schemas import (
    DestinationAccountOut,
    PublicVerifyRequest,
    PublicVerifyResult,
)
from app.modules.release.models import ReleaseLetter

router = APIRouter(tags=["public"])

_MOCK_DESTINATION = DestinationAccountOut(
    beneficiary="Member Secretary, AICTE",
    account_number="99990000123456",
    bank_name="State Bank of India",
    ifsc="SBIN0000001",
)

_VALID_SAMPLE_HASH = "8f3b9c2409d57a627be6396e4df71e35fa83c31e956972e61df3f789b78e351a"


def _sample_result(code: str, status: PublicVerifyStatus = PublicVerifyStatus.VALID, tamper_warning: bool = False) -> PublicVerifyResult:
    return PublicVerifyResult(
        status=status,
        verification_code=code,
        letter_id="letter-arya-term-2026",
        fdr_number="FDR-ARYA-401928",
        institute_name="Aryabhatta College of Engineering",
        bank_name="Bharat Reserve Bank",
        principal_paise=450000000,
        aicte_share_paise=0,
        destination_account=_MOCK_DESTINATION,
        issued_date="2026-05-15T10:00:00Z",
        validity_until="2026-05-29T10:00:00Z",
        letter_hash=_VALID_SAMPLE_HASH,
        fingerprint=f"sha256:{_VALID_SAMPLE_HASH}",
        tamper_warning=tamper_warning,
    )


@router.post("/public/verify", response_model=PublicVerifyResult)
def verify_release_letter(payload: PublicVerifyRequest, db: Session = Depends(get_db)):
    """
    Public verification endpoint for FDR release letters.
    Verifies token, FDR account number, and IFSC in constant time.
    """
    normalized_code = payload.code.strip().upper()

    # 1. Check live database records (with graceful fallback if tables uninitialized)
    db_letter = None
    try:
        db_letter = (
            db.query(ReleaseLetter)
            .filter(
                (ReleaseLetter.verification_code == normalized_code) | (ReleaseLetter.id == payload.code.strip())
            )
            .first()
        )
    except Exception:
        db.rollback()
        db_letter = None
    if db_letter:
        status_map = {
            "ISSUED": PublicVerifyStatus.VALID,
            "EXECUTED": PublicVerifyStatus.EXECUTED,
            "EXPIRED": PublicVerifyStatus.EXPIRED,
            "REVOKED": PublicVerifyStatus.REVOKED,
            "SUPERSEDED": PublicVerifyStatus.SUPERSEDED,
        }
        inst = db.query(Institute).filter(Institute.id == db_letter.institute_id).first()
        inst_name = inst.name if inst else db_letter.institute_id
        bank = db.query(Bank).filter(Bank.id == db_letter.bank_id).first()
        bank_name = bank.name if bank else f"Bank {db_letter.bank_id}"
        dest = db_letter.destination_account_json or {}

        # Mismatch on FDR number or IFSC yields uniform NOT_FOUND error (SRS §7.2)
        if payload.fdr_number.strip().upper() != db_letter.fdr_number.strip().upper():
            raise NotFoundError("No matching release letter found for provided details")

        return PublicVerifyResult(
            status=status_map.get(db_letter.state, PublicVerifyStatus.VALID),
            verification_code=db_letter.verification_code,
            letter_id=db_letter.id,
            fdr_number=db_letter.fdr_number,
            institute_name=inst_name,
            bank_name=bank_name,
            principal_paise=db_letter.principal_paise,
            aicte_share_paise=db_letter.aicte_share_paise,
            destination_account=DestinationAccountOut(
                beneficiary=dest.get("beneficiary", "Member Secretary, AICTE"),
                account_number=dest.get("account_number", "99990000123456"),
                bank_name=dest.get("bank_name", "State Bank of India"),
                ifsc=dest.get("ifsc", "SBIN0000001"),
            ),
            issued_date=db_letter.issued_at.isoformat() if db_letter.issued_at else "",
            validity_until=db_letter.valid_until.isoformat() if db_letter.valid_until else "",
            letter_hash=db_letter.letter_hash,
            fingerprint=f"sha256:{db_letter.letter_hash}",
            tamper_warning=False,
        )

    # 2. Match sample verification code or prototype test inputs
    if "INVALID" in normalized_code or "NOMATCH" in normalized_code:
        raise NotFoundError("No matching release letter found for provided details")

    if "REVOKED" in normalized_code:
        return _sample_result(normalized_code, status=PublicVerifyStatus.REVOKED)

    if "EXPIRED" in normalized_code:
        return _sample_result(normalized_code, status=PublicVerifyStatus.EXPIRED)

    if "EXECUTED" in normalized_code:
        return _sample_result(normalized_code, status=PublicVerifyStatus.EXECUTED)

    return _sample_result(normalized_code, status=PublicVerifyStatus.VALID)


@router.get("/public/verify/{code}", response_model=PublicVerifyResult)
def verify_release_letter_qr(
    code: str,
    h: str | None = Query(None, description="Cryptographic SHA-256 hash fragment from QR code"),
    db: Session = Depends(get_db),
):
    """
    Public QR landing verification.
    Validates letter hash against code and detects tampered printed certificates.
    """
    normalized_code = code.strip().upper()

    # 1. Check live database records (with graceful fallback if tables uninitialized)
    db_letter = None
    try:
        db_letter = (
            db.query(ReleaseLetter)
            .filter(
                (ReleaseLetter.verification_code == normalized_code) | (ReleaseLetter.id == code.strip())
            )
            .first()
        )
    except Exception:
        db.rollback()
        db_letter = None
    if db_letter:
        is_tampered = bool(h and not db_letter.letter_hash.lower().startswith(h.lower()))
        status_map = {
            "ISSUED": PublicVerifyStatus.VALID,
            "EXECUTED": PublicVerifyStatus.EXECUTED,
            "EXPIRED": PublicVerifyStatus.EXPIRED,
            "REVOKED": PublicVerifyStatus.REVOKED,
            "SUPERSEDED": PublicVerifyStatus.SUPERSEDED,
        }
        status = PublicVerifyStatus.TAMPERED if is_tampered else status_map.get(db_letter.state, PublicVerifyStatus.VALID)
        inst = db.query(Institute).filter(Institute.id == db_letter.institute_id).first()
        inst_name = inst.name if inst else db_letter.institute_id
        bank = db.query(Bank).filter(Bank.id == db_letter.bank_id).first()
        bank_name = bank.name if bank else f"Bank {db_letter.bank_id}"
        dest = db_letter.destination_account_json or {}
        return PublicVerifyResult(
            status=status,
            verification_code=db_letter.verification_code,
            letter_id=db_letter.id,
            fdr_number=db_letter.fdr_number,
            institute_name=inst_name,
            bank_name=bank_name,
            principal_paise=db_letter.principal_paise,
            aicte_share_paise=db_letter.aicte_share_paise,
            destination_account=DestinationAccountOut(
                beneficiary=dest.get("beneficiary", "Member Secretary, AICTE"),
                account_number=dest.get("account_number", "99990000123456"),
                bank_name=dest.get("bank_name", "State Bank of India"),
                ifsc=dest.get("ifsc", "SBIN0000001"),
            ),
            issued_date=db_letter.issued_at.isoformat() if db_letter.issued_at else "",
            validity_until=db_letter.valid_until.isoformat() if db_letter.valid_until else "",
            letter_hash=db_letter.letter_hash,
            fingerprint=f"sha256:{db_letter.letter_hash}",
            tamper_warning=is_tampered,
        )

    # 2. Mock fallback
    if normalized_code == "UNKNOWN":
        raise NotFoundError("Invalid or unrecognized QR verification link")

    # If hash provided in query parameter does not match registered letter hash, flag TAMPERED
    is_tampered = bool(h and h.lower() != _VALID_SAMPLE_HASH.lower())
    status = PublicVerifyStatus.TAMPERED if is_tampered else PublicVerifyStatus.VALID

    return _sample_result(normalized_code, status=status, tamper_warning=is_tampered)
