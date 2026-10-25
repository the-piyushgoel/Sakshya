"""Deterministic seed data for release-owned tables."""
from datetime import timedelta

from app.core import clock
from app.core.db import SessionLocal
from app.modules.intake.ids import institute_id, stable_id
from app.modules.release.models import Hold
from app.modules.release.schemas import HoldScope


def seed() -> None:
    """Seed initial compliance holds for testing and demo inspection."""
    session = SessionLocal()
    try:
        if session.query(Hold).count():
            return

        now = clock.now()

        # 1. Active compliance hold on Nalanda Technical Campus
        session.add(
            Hold(
                id=stable_id("hold", "nalanda-compliance"),
                scope=HoldScope.INSTITUTE.value,
                entity_id=institute_id("nalanda"),
                reason="Section 10-A statutory compliance inquiry pending",
                legal_ref="AICTE/LEGAL/2026/8821",
                is_active=True,
                placed_by_id=stable_id("user", "co1"),
                placed_at=now - timedelta(days=15),
                lifted_by_id=None,
                lifted_at=None,
                lift_reason=None,
            )
        )

        # 2. Historical lifted hold on Takshashila for audit inspection
        session.add(
            Hold(
                id=stable_id("hold", "takshashila-audit"),
                scope=HoldScope.INSTITUTE.value,
                entity_id=institute_id("takshashila"),
                reason="Routine governance inquiry on trust deed amendments",
                legal_ref="AICTE/GOV/2025/104",
                is_active=False,
                placed_by_id=stable_id("user", "co1"),
                placed_at=now - timedelta(days=120),
                lifted_by_id=stable_id("user", "co1"),
                lifted_at=now - timedelta(days=90),
                lift_reason="Governance amendments validated by AICTE Standing Committee",
            )
        )

        session.commit()
    finally:
        session.close()

