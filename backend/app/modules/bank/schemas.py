"""
Bank module schemas (§3.5) — Pydantic v2.

Field names are frozen by contract; do NOT rename.
"""
from __future__ import annotations

from app.core.enums import BankOutcome, BankRequestState
from pydantic import BaseModel, Field

# ── Bank directory ─────────────────────────────────────────────────────────────

class BankOut(BaseModel):
    id: str
    name: str
    code: str
    swift: str | None = None
    is_active: bool = True


class BankListResponse(BaseModel):
    items: list[BankOut]
    total: int


class NodalContactOut(BaseModel):
    id: str
    bank_id: str
    name: str
    email: str
    phone: str
    is_directory: bool = True


class NodalContactListResponse(BaseModel):
    items: list[NodalContactOut]
    total: int


# ── Bank request (AICTE side) ─────────────────────────────────────────────────

class BankRequestCreate(BaseModel):
    instrument_id: str
    bank_id: str | None = None
    reason: str | None = None
    remarks: str | None = None


class BankRequestOut(BaseModel):
    id: str
    instrument_id: str
    bank_id: str
    state: BankRequestState
    outcome: BankOutcome | None = None
    remarks: str | None = None
    created_at: str
    updated_at: str


class BankRequestListResponse(BaseModel):
    items: list[BankRequestOut]
    total: int


# ── Bank request detail (with checklist) ──────────────────────────────────────

class ChecklistItem(BaseModel):
    item_no: int
    question: str
    answer: bool | None = None
    remarks: str | None = None


class DirectoryContact(BaseModel):
    name: str
    email: str
    phone: str
    is_directory: bool = True


class InstrumentSummary(BaseModel):
    id: str
    fdr_number: str
    bank_ifsc: str
    principal_paise: int
    maturity_date: str
    state: str


class BankRequestDetail(BaseModel):
    id: str
    instrument_id: str
    bank_id: str
    state: BankRequestState
    outcome: BankOutcome | None = None
    directory_contact: DirectoryContact
    checklist: list[ChecklistItem] = Field(default_factory=list)
    instrument: InstrumentSummary
    remarks: str | None = None
    created_at: str
    updated_at: str


# ── Bank inbox (bank-facing) ──────────────────────────────────────────────────

class BankInboxItem(BaseModel):
    id: str
    instrument_id: str
    fdr_number: str
    principal_paise: int
    state: BankRequestState
    created_at: str


class BankInboxResponse(BaseModel):
    items: list[BankInboxItem]
    total: int


# ── Maker submit / Checker decision ──────────────────────────────────────────

class MakerSubmitRequest(BaseModel):
    checklist: list[ChecklistItem] = Field(..., min_length=12, max_length=12)
    outcome: BankOutcome
    remarks: str | None = None


class CheckerDecisionRequest(BaseModel):
    decision: str = Field(..., description="AUTHORISE or RETURN")
    remarks: str | None = None
