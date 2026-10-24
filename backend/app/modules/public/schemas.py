"""
Public verification schemas (§3.5).
"""
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import PublicVerifyStatus


class PublicVerifyRequest(BaseModel):
    code: str = Field(..., description="16-char Crockford Base32 verification code")
    fdr_number: str = Field(..., description="FDR certificate number")
    ifsc: str = Field(..., description="Bank branch IFSC")


class DestinationAccountOut(BaseModel):
    beneficiary: str
    account_number: str
    bank_name: str
    ifsc: str


class PublicVerifyResult(BaseModel):
    status: PublicVerifyStatus
    verification_code: str
    letter_id: str
    fdr_number: str
    institute_name: str
    bank_name: str
    principal_paise: int = Field(..., description="Principal amount to Trust in integer paise")
    aicte_share_paise: int = Field(..., description="AICTE share in integer paise")
    destination_account: DestinationAccountOut
    issued_date: str
    validity_until: str
    letter_hash: str
    fingerprint: str
    tamper_warning: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)

