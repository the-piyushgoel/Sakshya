"""
Deterministic seed data for core system users, clock, policies, and audit genesis (§3.3, §3.6, §6.4, §7.7).
"""
from uuid import NAMESPACE_URL, uuid5

from app.core import audit, clock, notify
from app.core.db import SessionLocal
from app.core.enums import Role
from app.core.models import AuditEvent, ClockState, Notification, PolicyVersion, User
from app.core.policy import DEFAULT_POLICIES
from app.core.security import hash_password
from app.modules.bank.ids import bank_id
from app.modules.intake.ids import institute_id

DEFAULT_PASSWORD: str = "demo@123"
DEFAULT_STEP_UP_PIN: str = "246810"


def user_id(username: str) -> str:
    """Generate a deterministic UUIDv5 for a user."""
    return str(uuid5(NAMESPACE_URL, f"sakshya:user:{username}"))


def seed() -> None:
    """Seed prototype accounts, clock state, regulatory policy, and audit genesis block."""
    session = SessionLocal()
    try:
        now_dt = clock.now()

        # 1. Seed Users (§3.3)
        if session.query(User).count() == 0:
            hashed = hash_password(DEFAULT_PASSWORD)
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

        # 2. Seed Clock State (§3.6)
        if session.query(ClockState).count() == 0:
            session.add(ClockState(id=1, offset_seconds=0, updated_at=now_dt))
            session.commit()

        # 3. Seed Policy Version (§6.4)
        if session.query(PolicyVersion).count() == 0:
            policy_id = str(uuid5(NAMESPACE_URL, "sakshya:policy:v1"))
            session.add(
                PolicyVersion(
                    id=policy_id,
                    version_number=1,
                    parameters_json=DEFAULT_POLICIES,
                    created_at=now_dt,
                    is_active=True,
                )
            )
            session.commit()

        # 4. Seed Genesis Audit Anchor Block (§7.7)
        if session.query(AuditEvent).count() == 0:
            audit.log(
                actor="system:seed",
                action="GENESIS_INITIALIZED",
                entity_type="SYSTEM",
                entity_id="sakshya:v1.0",
                payload={
                    "version": "1.0.0",
                    "description": "Sakshya Genesis Cryptographic Anchor Block",
                },
                actor_role=Role.SYSTEM_ADMIN.value,
                db=session,
            )
            session.commit()

        # 5. Seed Welcome Notifications (§3.4, §7.8)
        if session.query(Notification).count() == 0:
            notify.send(
                title="Welcome to Sakshya FDR Portal",
                body="Your institute portal is active. You can now upload FDR certificates for validation.",
                user_id=user_id("ar_sig"),
                institute_id=institute_id("aryabhatta"),
                dedupe_key="seed:welcome:ar_sig",
                db=session,
            )
            notify.send(
                title="System Ready: Scrutiny Queue",
                body="Prototype accounts initialized. Scrutiny and verification queues are ready.",
                user_id=user_id("so1"),
                role=Role.SCRUTINY_OFFICER.value,
                dedupe_key="seed:welcome:so1",
                db=session,
            )
            notify.send(
                title="Genesis Anchor Initialized",
                body="Cryptographic audit chain genesis block has been sealed.",
                user_id=user_id("aud1"),
                role=Role.AUDITOR.value,
                dedupe_key="seed:welcome:aud1",
                db=session,
            )
            session.commit()

    finally:
        session.close()
