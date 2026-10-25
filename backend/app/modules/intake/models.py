"""SQLAlchemy models owned by the intake module."""
from datetime import date, datetime
from uuid import uuid4

from app.core.db import Base
from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


def _id() -> str:
    return str(uuid4())


class Institute(Base):
    __tablename__ = "institute"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(120))
    trusts: Mapped[list["Trust"]] = relationship(back_populates="institute", cascade="all, delete-orphan")
    obligations: Mapped[list["Obligation"]] = relationship(back_populates="institute")


class Trust(Base):
    __tablename__ = "trust"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    institute_id: Mapped[str] = mapped_column(ForeignKey("institute.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    institute: Mapped[Institute] = relationship(back_populates="trusts")


class Obligation(Base):
    __tablename__ = "obligation"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    institute_id: Mapped[str] = mapped_column(ForeignKey("institute.id"), nullable=False, index=True)
    trust_id: Mapped[str | None] = mapped_column(ForeignKey("trust.id"), index=True)
    programme: Mapped[str] = mapped_column(String(255), nullable=False)
    required_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    term_years: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    state: Mapped[str] = mapped_column(String(40), nullable=False)
    institute: Mapped[Institute] = relationship(back_populates="obligations")
    instruments: Mapped[list["Instrument"]] = relationship(back_populates="obligation", cascade="all, delete-orphan")


class Instrument(Base):
    __tablename__ = "instrument"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    obligation_id: Mapped[str] = mapped_column(ForeignKey("obligation.id"), nullable=False, index=True)
    institute_id: Mapped[str] = mapped_column(ForeignKey("institute.id"), nullable=False, index=True)
    bank_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(40), nullable=False)
    is_quarantined: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supersedes_id: Mapped[str | None] = mapped_column(String(36), index=True)
    scrutiny_officer_id: Mapped[str | None] = mapped_column(String(36))
    fdr_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True, unique=False)
    created_by: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    obligation: Mapped[Obligation] = relationship(back_populates="instruments")
    versions: Mapped[list["InstrumentVersion"]] = relationship(back_populates="instrument", cascade="all, delete-orphan")
    fields: Mapped[list["FieldTrust"]] = relationship(back_populates="instrument", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(back_populates="instrument", cascade="all, delete-orphan")
    discrepancies: Mapped[list["Discrepancy"]] = relationship(back_populates="instrument", cascade="all, delete-orphan")
    history: Mapped[list["InstrumentStateHistory"]] = relationship(back_populates="instrument", cascade="all, delete-orphan")


class InstrumentVersion(Base):
    __tablename__ = "instrument_version"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instrument.id"), nullable=False, index=True)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    fields_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    document_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    instrument: Mapped[Instrument] = relationship(back_populates="versions")


class FieldTrust(Base):
    __tablename__ = "field_trust"
    __table_args__ = (UniqueConstraint("instrument_id", "field_name"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instrument.id"), nullable=False, index=True)
    field_name: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[str | None] = mapped_column(Text)
    trust: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str | None] = mapped_column(String(50))
    evidence_ref: Mapped[str | None] = mapped_column(String(36))
    set_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    instrument: Mapped[Instrument] = relationship(back_populates="fields")


class Document(Base):
    __tablename__ = "document"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instrument.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(String(36))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    instrument: Mapped[Instrument] = relationship(back_populates="documents")
    checks: Mapped[list["DocCheck"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class DocCheck(Base):
    __tablename__ = "doc_check"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("document.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    document: Mapped[Document] = relationship(back_populates="checks")


class Discrepancy(Base):
    __tablename__ = "discrepancy"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instrument.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    details_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    resolved_by: Mapped[str | None] = mapped_column(String(36))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    instrument: Mapped[Instrument] = relationship(back_populates="discrepancies")


class InstrumentStateHistory(Base):
    __tablename__ = "instrument_state_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instrument.id"), nullable=False, index=True)
    from_state: Mapped[str | None] = mapped_column(String(40))
    to_state: Mapped[str] = mapped_column(String(40), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36))
    reason: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    instrument: Mapped[Instrument] = relationship(back_populates="history")
