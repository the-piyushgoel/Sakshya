"""SQLAlchemy models owned by the bank module."""
from datetime import datetime
from uuid import uuid4

from app.core.db import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship


def _id() -> str:
    return str(uuid4())


class Bank(Base):
    __tablename__ = "bank"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ifsc_prefix: Mapped[str] = mapped_column(String(10), nullable=False)
    contacts: Mapped[list["BankNodalContact"]] = relationship(back_populates="bank", cascade="all, delete-orphan")


class BankNodalContact(Base):
    __tablename__ = "bank_nodal_contact"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    bank_id: Mapped[str] = mapped_column(ForeignKey("bank.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    designation: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    bank: Mapped[Bank] = relationship(back_populates="contacts")


class BankRequest(Base):
    __tablename__ = "bank_request"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    instrument_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    bank_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(40), nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(30))
    reason: Mapped[str | None] = mapped_column(Text)
    directory_contact_id: Mapped[str | None] = mapped_column(String(36))
    created_by: Mapped[str | None] = mapped_column(String(36))
    maker_id: Mapped[str | None] = mapped_column(String(36))
    checker_id: Mapped[str | None] = mapped_column(String(36))
    remarks: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    notified_at: Mapped[datetime | None] = mapped_column(DateTime)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
    checklist: Mapped[list["BankChecklistItem"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class BankChecklistItem(Base):
    __tablename__ = "bank_checklist_item"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey("bank_request.id"), nullable=False, index=True)
    item_no: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[bool | None] = mapped_column(Boolean)
    remarks: Mapped[str | None] = mapped_column(Text)
    request: Mapped[BankRequest] = relationship(back_populates="checklist")
