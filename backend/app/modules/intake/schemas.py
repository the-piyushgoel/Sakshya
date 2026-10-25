"""
Intake module schemas (§3.5) — Pydantic v2.

Field names are frozen by contract; do NOT rename.
Money is integer paise.  Dates "YYYY-MM-DD".  Timestamps ISO UTC strings.
"""
from __future__ import annotations

from app.core.enums import (
    BankRequestState,
    DiscrepancyStatus,
    DocCheckOutcome,
    InstrumentState,
    ObligationState,
    Severity,
    TrustLevel,
)
from pydantic import BaseModel, Field

# ── Shared pieces ──────────────────────────────────────────────────────────────

class InstrumentField(BaseModel):
    """Single field with trust-level provenance."""
    name: str
    value: str
    trust: TrustLevel
    source: str
    evidence_ref: str | None = None
    set_at: str


class DocCheck(BaseModel):
    name: str
    outcome: DocCheckOutcome
    confidence: float | None = None
    details: str | None = None


class DiscrepancyOut(BaseModel):
    id: str
    instrument_id: str
    code: str
    severity: Severity
    status: DiscrepancyStatus
    details: dict | None = None
    created_at: str
    resolved_at: str | None = None
    resolved_by: str | None = None
    resolution_note: str | None = None


class BankRequestSummary(BaseModel):
    id: str
    state: BankRequestState
    outcome: str | None = None
    created_at: str


class ObligationSummary(BaseModel):
    id: str
    programme: str
    required_paise: int
    state: ObligationState


class InstrumentVersion(BaseModel):
    version_no: int
    fields_json: dict
    document_id: str | None = None
    created_at: str


class TimelineEvent(BaseModel):
    from_state: str | None = None
    to_state: str
    actor_id: str
    reason: str | None = None
    at: str


# ── Institute / Obligation ────────────────────────────────────────────────────

class InstituteOut(BaseModel):
    id: str
    name: str
    code: str
    city: str


class ObligationOut(BaseModel):
    id: str
    institute_id: str
    trust_id: str
    programme: str
    required_paise: int
    term_years: int
    start_date: str
    end_date: str
    state: ObligationState
    covered_paise: int = 0
    instruments_count: int = 0


class ObligationListResponse(BaseModel):
    items: list[ObligationOut]
    total: int


# ── Instrument ────────────────────────────────────────────────────────────────

class InstrumentOut(BaseModel):
    id: str
    obligation_id: str
    institute_id: str
    bank_id: str
    state: InstrumentState
    is_quarantined: bool
    fdr_number: str | None = None
    principal_paise: int | None = None
    maturity_date: str | None = None
    created_at: str


class InstrumentListResponse(BaseModel):
    items: list[InstrumentOut]
    total: int


class InstrumentDetail(BaseModel):
    id: str
    obligation_id: str
    institute_id: str
    bank_id: str
    state: InstrumentState
    is_quarantined: bool
    fields: list[InstrumentField]
    versions: list[InstrumentVersion]
    documents: list[dict] = Field(default_factory=list)
    doc_checks: list[DocCheck] = Field(default_factory=list)
    discrepancies: list[DiscrepancyOut] = Field(default_factory=list)
    bank_requests: list[BankRequestSummary] = Field(default_factory=list)
    obligation: ObligationSummary | None = None
    created_at: str


# ── Document Preview ──────────────────────────────────────────────────────────

class ExtractedFieldValue(BaseModel):
    value: str
    confidence: float
    source: str


class DocumentPreviewResponse(BaseModel):
    extracted: dict[str, ExtractedFieldValue]
    checks: list[DocCheck]
    flags: list[str] = Field(default_factory=list)


# ── Discrepancy resolution ────────────────────────────────────────────────────

class DiscrepancyResolveRequest(BaseModel):
    action: str = Field(..., description="CLEAR, ESCALATE, or REJECT")
    note: str = Field(..., min_length=3)


class DiscrepancyListResponse(BaseModel):
    items: list[DiscrepancyOut]
    total: int


# ── Instrument action responses ───────────────────────────────────────────────

class InstrumentActionResponse(BaseModel):
    id: str
    state: InstrumentState
    is_quarantined: bool
    message: str


class InstrumentRenewRequest(BaseModel):
    mode: str | None = None
    new_maturity_date: str | None = None
    remarks: str | None = None
