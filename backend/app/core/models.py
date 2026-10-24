"""
Core database models for Sakshya — User, Audit, Clock, and Policy (§3.4, §7.7, §6.4).
"""
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, JSON, String
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


class AuditEvent(Base):
    """
    Tamper-evident cryptographically chained audit event (§7.7).
    Each event hash links directly to its predecessor, forming an immutable chain.
    """
    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "seq": self.seq,
            "ts": self.ts.isoformat() if self.ts else None,
            "actor_id": self.actor_id,
            "actor_role": self.actor_role,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "payload": self.payload_json or {},
            "prev_hash": self.prev_hash,
            "hash": self.hash,
        }


class ClockState(Base):
    """
    Persistent state for the simulated clock (§3.6).
    Enables demo time travel that survives application restarts.
    """
    __tablename__ = "clock_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    offset_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)


class PolicyVersion(Base):
    """
    Versioned regulatory and business policy parameters (§6.4).
    """
    __tablename__ = "policy_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    version_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    parameters_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=clock.now, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
