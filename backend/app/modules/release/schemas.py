"""
Release module schemas (§3.5).
"""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import CaseType, LetterState, ReleaseState, RuleResult


class HoldScope(str, Enum):
    INSTITUTE = "INSTITUTE"
    TRUST = "TRUST"
    INSTRUMENT = "INSTRUMENT"


# ── Release Request Schemas ────────────────────────────────────────────────────

class ReleaseRequestCreate(BaseModel):
    obligation_id: str
    instrument_ids: list[str] = Field(default_factory=list)
    case_type: CaseType = CaseType.TERM_COMPLETE
    remarks: str | None = None


class EligibilityRuleResultOut(BaseModel):
    rule_id: str
    name: str
    result: RuleResult
    message: str
    fix_hint: str | None = None


class SettlementBreakdownOut(BaseModel):
    principal_to_trust_paise: int
    aicte_share_paise: int
    penalty_paise: int = 0
    interest_paise: int = 0


class ReleaseRequestOut(BaseModel):
    id: str
    obligation_id: str
    institute_id: str
    institute_name: str
    case_type: CaseType
    state: ReleaseState
    instrument_ids: list[str]
    total_amount_paise: int
    settlement: SettlementBreakdownOut
    letter_id: str | None = None
    recommender_id: str | None = None
    recommendation_note: str | None = None
    rejection_reason: str | None = None
    created_at: str
    updated_at: str


class ReleaseRequestDetailOut(ReleaseRequestOut):
    eligibility_verdict: str
    rules: list[EligibilityRuleResultOut]
    audit_trail: list[dict[str, Any]] = Field(default_factory=list)


class ReleaseRequestListResponse(BaseModel):
    items: list[ReleaseRequestOut]
    total: int


class ReleaseRecommendRequest(BaseModel):
    recommendation_note: str = Field(..., min_length=3)


class ReleaseRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class ReleaseSignResponse(BaseModel):
    status: str = "SIGNED"
    request_id: str
    letter_id: str
    verification_code: str
    letter_hash: str
    signed_at: str
    pdf_url: str


# ── Release Letter Schemas ─────────────────────────────────────────────────────

class ReleaseLetterOut(BaseModel):
    id: str
    release_request_id: str
    institute_id: str
    institute_name: str
    bank_id: str
    bank_name: str
    fdr_number: str
    state: LetterState
    verification_code: str
    letter_hash: str
    signature_hex: str
    principal_paise: int
    aicte_share_paise: int
    destination_account: dict[str, str]
    issued_date: str
    valid_until: str
    revoke_reason: str | None = None


class LetterRevokeRequest(BaseModel):
    reason: str = Field(..., min_length=3)


# ── Hold Schemas ───────────────────────────────────────────────────────────────

class HoldCreateRequest(BaseModel):
    scope: HoldScope
    entity_id: str
    reason: str = Field(..., min_length=3)
    legal_ref: str | None = None


class HoldLiftRequest(BaseModel):
    reason: str = Field(..., min_length=3)


class HoldOut(BaseModel):
    id: str
    scope: HoldScope
    entity_id: str
    reason: str
    legal_ref: str | None = None
    is_active: bool
    placed_by_id: str
    placed_at: str
    lifted_by_id: str | None = None
    lifted_at: str | None = None
    lift_reason: str | None = None


class HoldListResponse(BaseModel):
    items: list[HoldOut]
    total: int


# ── Bank Execution Schemas ─────────────────────────────────────────────────────

class BankLetterOut(BaseModel):
    letter_id: str
    fdr_number: str
    institute_name: str
    principal_paise: int
    aicte_share_paise: int
    status: str
    utr: str | None = None
    executed_at: str | None = None


class BankLetterListResponse(BaseModel):
    items: list[BankLetterOut]
    total: int


class BankExecuteMakerRequest(BaseModel):
    utr: str = Field(..., min_length=6)
    principal_paise: int = Field(..., ge=0)
    aicte_share_paise: int = Field(..., ge=0)
    execution_date: str


class BankExecuteCheckerRequest(BaseModel):
    decision: str = Field(..., description="AUTHORISE or RETURN")
    remarks: str | None = None


# ── Finance Settlement Schemas ─────────────────────────────────────────────────

class SettlementOut(BaseModel):
    id: str
    release_request_id: str
    letter_id: str
    institute_id: str
    institute_name: str
    bank_name: str
    expected_aicte_share_paise: int
    credited_paise: int | None = None
    bank_ref: str | None = None
    is_settled: bool
    confirmed_at: str | None = None
    override_note: str | None = None


class SettlementListResponse(BaseModel):
    items: list[SettlementOut]
    total: int


class SettlementConfirmRequest(BaseModel):
    credited_paise: int = Field(..., ge=0)
    bank_ref: str = Field(..., min_length=4)
    override_note: str | None = None

