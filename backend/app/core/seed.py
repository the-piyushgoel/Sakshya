"""
Deterministic seed data for core system users (§3.3).
"""
from uuid import NAMESPACE_URL, uuid5

from app.core import clock
from app.core.db import SessionLocal
from app.core.enums import Role
from app.core.models import User
from app.core.security import hash_password
from app.modules.bank.ids import bank_id
from app.modules.intake.ids import institute_id

DEFAULT_PASSWORD: str = "demo@123"
DEFAULT_STEP_UP_PIN: str = "246810"


def user_id(username: str) -> str:
    """Generate a deterministic UUIDv5 for a user."""
    return str(uuid5(NAMESPACE_URL, f"sakshya:user:{username}"))


def seed() -> None:
    """Seed all 19 standard prototype accounts (§3.3)."""
    session = SessionLocal()
    try:
        if session.query(User).count() > 0:
            return

        hashed = hash_password(DEFAULT_PASSWORD)
        now_dt = clock.now()

        # Seed catalogue matching §3.3
        users_meta = [
            # Institute Signatories
            ("ar_sig", "Aryabhatta Signatory", [Role.INS_SIGNATORY.value], institute_id("aryabhatta"), None),
            ("vj_sig", "Vidya Jyoti Signatory", [Role.INS_SIGNATORY.value], institute_id("vidyajyoti"), None),
            ("na_sig", "Nalanda Signatory", [Role.INS_SIGNATORY.value], institute_id("nalanda"), None),
            ("ta_sig", "Takshashila Signatory", [Role.INS_SIGNATORY.value], institute_id("takshashila"), None),
            # Officers
            ("so1", "Scrutiny Officer 1", [Role.SCRUTINY_OFFICER.value], None, None),
            ("so2", "Scrutiny Officer 2", [Role.SCRUTINY_OFFICER.value], None, None),
            ("ao1", "Scrutiny & Approving Officer", [Role.SCRUTINY_OFFICER.value, Role.APPROVING_OFFICER.value], None, None),
            ("ao2", "Approving Officer 2", [Role.APPROVING_OFFICER.value], None, None),
            ("ra1", "Release Authority (Member Secretary)", [Role.RELEASE_AUTHORITY.value], None, None),
            ("fo1", "Finance Officer", [Role.FINANCE_OFFICER.value], None, None),
            ("co1", "Compliance Officer", [Role.COMPLIANCE_OFFICER.value], None, None),
            ("lead1", "Leadership Director", [Role.LEADERSHIP.value], None, None),
            ("aud1", "External Auditor", [Role.AUDITOR.value], None, None),
            ("admin1", "System Administrator", [Role.SYSTEM_ADMIN.value], None, None),
            # Bank Maker/Checker pairs (BRB, HCB, SCB)
            ("brb_mk", "BRB Maker", [Role.BANK_MAKER.value], None, bank_id("BRB")),
            ("brb_ck", "BRB Checker", [Role.BANK_CHECKER.value], None, bank_id("BRB")),
            ("hcb_mk", "HCB Maker", [Role.BANK_MAKER.value], None, bank_id("HCB")),
            ("hcb_ck", "HCB Checker", [Role.BANK_CHECKER.value], None, bank_id("HCB")),
            ("scb_mk", "SCB Maker", [Role.BANK_MAKER.value], None, bank_id("SCB")),
            ("scb_ck", "SCB Checker", [Role.BANK_CHECKER.value], None, bank_id("SCB")),
        ]

        for username, display_name, roles, inst_id, b_id in users_meta:
            u = User(
                id=user_id(username),
                username=username,
                password_hash=hashed,
                display_name=display_name,
                roles_json=roles,
                institute_id=inst_id,
                bank_id=b_id,
                step_up_until=None,
                created_at=now_dt,
            )
            session.add(u)

        session.commit()
    finally:
        session.close()
