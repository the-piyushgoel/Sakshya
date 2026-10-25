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

