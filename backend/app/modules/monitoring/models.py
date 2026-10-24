"""
SQLAlchemy models owned by the monitoring module (§3.4, §7.8).
"""
from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _id() -> str:
    return str(uuid4())


class Alert(Base):
    __tablename__ = "alert"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    instrument_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    obligation_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    institute_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    institute_name: Mapped[str] = mapped_column(String(255), nullable=False)
    fdr_number: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    alert_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    window_days: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    maturity_date: Mapped[date] = mapped_column(Date, nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

