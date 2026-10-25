"""Insights-owned persistence models."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class RiskScore(Base):
    __tablename__ = "risk_score"

    instrument_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    factors_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
