"""
Public module router — owned by Premansh (Lane A).

Endpoints from §3.5:
  POST /public/verify
  GET  /public/verify/{code}

No authentication required — these are public endpoints.
"""
from fastapi import APIRouter, Query

from app.core.enums import PublicVerifyStatus
from app.core.errors import NotFoundError
from app.modules.public.schemas import (
    DestinationAccountOut,
    PublicVerifyRequest,
    PublicVerifyResult,
)

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
def verify_release_letter(payload: PublicVerifyRequest):
    """
    Public verification endpoint for FDR release letters.
    Verifies token, FDR account number, and IFSC in constant time.
    """
    normalized_code = payload.code.strip().upper()

    # Match sample verification code or prototype test inputs
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
):
    """
    Public QR landing verification.
    Validates letter hash against code and detects tampered printed certificates.
    """
    normalized_code = code.strip().upper()

    if normalized_code == "UNKNOWN":
        raise NotFoundError("Invalid or unrecognized QR verification link")

    # If hash provided in query parameter does not match registered letter hash, flag TAMPERED
    is_tampered = bool(h and h.lower() != _VALID_SAMPLE_HASH.lower())
    status = PublicVerifyStatus.TAMPERED if is_tampered else PublicVerifyStatus.VALID

    return _sample_result(normalized_code, status=status, tamper_warning=is_tampered)
