"""
Core database models for Sakshya — User and Authentication (§3.4).
"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core import clock
from app.core.db import Base


class User(Base):
    """
    User entity representing actors across the 12 system roles (§3.2, §3.3).
    Role permissions, bank binding, and institute scoping are evaluated from this model.
    """
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    roles_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    institute_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    bank_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    step_up_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)

    @property
    def roles(self) -> list[str]:
        return self.roles_json or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name,
            "roles": self.roles,
            "institute_id": self.institute_id,
            "bank_id": self.bank_id,
        }

