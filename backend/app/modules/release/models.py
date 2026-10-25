"""SQLAlchemy ORM models owned by the release module."""
from datetime import datetime
from uuid import uuid4

from app.core.db import Base
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


def _id() -> str:
    return str(uuid4())


class ReleaseRequest(Base):
    __tablename__ = "release_request"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    obligation_id: Mapped[str] = mapped_column(ForeignKey("obligation.id"), nullable=False, index=True)
    institute_id: Mapped[str] = mapped_column(ForeignKey("institute.id"), nullable=False, index=True)
    case_type: Mapped[str] = mapped_column(String(50), nullable=False, default="TERM_COMPLETE")
    state: Mapped[str] = mapped_column(String(40), nullable=False, default="SUBMITTED", index=True)
    instrument_ids_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    total_amount_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    settlement_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    eligibility_verdict: Mapped[str | None] = mapped_column(String(40), nullable=True)
    letter_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    recommender_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    recommendation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    rules: Mapped[list["EligibilityRuleResult"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="EligibilityRuleResult.rule_id",
    )
    letter: Mapped["ReleaseLetter | None"] = relationship(
        back_populates="request",
        uselist=False,
    )
    settlement: Mapped["Settlement | None"] = relationship(
        "Settlement",
        back_populates="request",
        uselist=False,
    )


class EligibilityRuleResult(Base):
    __tablename__ = "eligibility_rule_result"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    release_request_id: Mapped[str] = mapped_column(ForeignKey("release_request.id"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    fix_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    request: Mapped[ReleaseRequest] = relationship(back_populates="rules")


class Hold(Base):
    __tablename__ = "hold"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    scope: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    legal_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    placed_by_id: Mapped[str] = mapped_column(String(36), nullable=False)
    placed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    lifted_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lift_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class ReleaseLetter(Base):
    """
    Immutable release letter issued and digitally signed by Release Authority (§7.2).
    Contains canonical payload, cryptographic signature, verification token, and PDF metadata.
    """
    __tablename__ = "release_letter"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    release_request_id: Mapped[str] = mapped_column(
        ForeignKey("release_request.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    obligation_id: Mapped[str] = mapped_column(
        ForeignKey("obligation.id"),
        nullable=False,
        index=True,
    )
    institute_id: Mapped[str] = mapped_column(
        ForeignKey("institute.id"),
        nullable=False,
        index=True,
    )
    bank_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    fdr_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(40), nullable=False, default="ISSUED", index=True)
    verification_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    letter_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    signature_hex: Mapped[str] = mapped_column(String(128), nullable=False)
    signer_key_id: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    policy_snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    principal_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    aicte_share_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    principal_to_trust_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    penalty_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    interest_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    destination_account_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    valid_until: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    revoked_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    superseded_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Bank Execution (remittance maker-checker) fields
    execution_maker_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    execution_maker_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    utr: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    execution_principal_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_aicte_share_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_date: Mapped[str | None] = mapped_column(String(20), nullable=True)

    execution_checker_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    execution_checker_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    execution_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    execution_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    request: Mapped["ReleaseRequest"] = relationship("ReleaseRequest", back_populates="letter")
    settlement: Mapped["Settlement | None"] = relationship(
        "Settlement",
        back_populates="letter",
        uselist=False,
    )


class Settlement(Base):
    """
    Financial reconciliation record for AICTE share and FDR settlement (SRS §7.2, FR-FIN-01..03).
    Created upon bank execution authorization; reconciled and confirmed by Finance Officer.
    """
    __tablename__ = "settlement"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    release_request_id: Mapped[str] = mapped_column(
        ForeignKey("release_request.id"),
        nullable=False,
        unique=True,
        index=True,
    )
    letter_id: Mapped[str] = mapped_column(
        ForeignKey("release_letter.id"),
        nullable=False,
        index=True,
    )
    institute_id: Mapped[str] = mapped_column(
        ForeignKey("institute.id"),
        nullable=False,
        index=True,
    )
    bank_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    expected_aicte_share_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    credited_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bank_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    override_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    request: Mapped["ReleaseRequest"] = relationship("ReleaseRequest", back_populates="settlement")
    letter: Mapped["ReleaseLetter"] = relationship("ReleaseLetter", back_populates="settlement")


