"""
Unit and integration tests for PR-3:
- Cryptographic Audit Hash Chain (§7.7)
- Clock Persistence & Time Travel (§3.6)
- Policy Parameter Engine (§6.4)
"""
from datetime import datetime, timezone
import os
from pathlib import Path
import re

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core import audit, clock, policy
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import Role
from app.core.models import AuditEvent, ClockState, PolicyVersion, User
from app.core.seed import seed as seed_core
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_pr3_db():
    """Ensure core tables, initial clock, policies, and seed users exist."""
    create_tables()
    seed_core()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    """Helper to authenticate and return bearer token."""
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200
    return res.json()["access_token"]


# ── Audit Chain Tests ──────────────────────────────────────────────────────────

def test_genesis_block_created():
    """Verify genesis audit event was initialized with 64 zeroes as prev_hash."""
    session = SessionLocal()
    try:
        genesis = session.query(AuditEvent).filter(AuditEvent.seq == 1).first()
        assert genesis is not None
        assert genesis.prev_hash == "0" * 64
        assert genesis.action == "GENESIS_INITIALIZED"
        assert len(genesis.hash) == 64

        # Initial chain must verify cleanly
        result = audit.verify_chain(session)
        assert result["ok"] is True
        assert result["checked"] >= 1
        assert result["first_broken_seq"] is None
    finally:
        session.close()


def test_audit_chain_500_events():
    """Verify inserting 500 audit events maintains total order and unbroken hash linkage."""
    session = SessionLocal()
    try:
        start_count = session.query(AuditEvent).count()

        for i in range(500):
            audit.log(
                actor=f"user_{i % 5}",
                action=f"ACTION_{i}",
                entity_type="TEST_ENTITY",
                entity_id=f"ent_{i}",
                payload={"index": i, "data": f"sample_{i}"},
                actor_role=Role.SCRUTINY_OFFICER.value,
                db=session,
            )
        session.commit()

        total_count = session.query(AuditEvent).count()
        assert total_count == start_count + 500

        # Verify entire chain of >500 events
        result = audit.verify_chain(session)
        assert result["ok"] is True
        assert result["checked"] == total_count
        assert result["first_broken_seq"] is None
    finally:
        session.close()


def test_tamper_detection_and_repair():
    """Verify tamper detection pinpoints the exact sequence number, and repair restores it."""
    session = SessionLocal()
    try:
        # 1. Tamper seq 42 directly in DB
        target_seq = 42
        original_event = session.query(AuditEvent).filter(AuditEvent.seq == target_seq).first()
        assert original_event is not None

        audit.tamper_event(
            db=session,
            seq=target_seq,
            new_payload={"tampered_amount": 9999999999},
        )

        # 2. Verification must fail and report exactly target_seq
        check_tampered = audit.verify_chain(session)
        assert check_tampered["ok"] is False
        assert check_tampered["first_broken_seq"] == target_seq

        # 3. Repair the chain from target_seq forward
        repair_res = audit.repair_chain(db=session, from_seq=target_seq)
        assert repair_res["status"] == "repaired"
        assert repair_res["repaired_count"] >= target_seq

        # 4. Verification must now succeed completely
        check_repaired = audit.verify_chain(session)
        assert check_repaired["ok"] is True
        assert check_repaired["first_broken_seq"] is None
    finally:
        session.close()


# ── Clock Persistence & Time Travel Tests ──────────────────────────────────────

def test_clock_persistence_and_advance():
    """Verify clock advancement updates in-memory time and persists to database table."""
    session = SessionLocal()
    try:
        clock.reset(db=session)
        assert clock.get_offset() == 0

        # Advance by 15 days and 6 hours
        days_to_add = 15
        hours_to_add = 6
        expected_offset = days_to_add * 86400 + hours_to_add * 3600

        advanced_time = clock.advance(days=days_to_add, hours=hours_to_add, db=session)
        assert clock.get_offset() == expected_offset

        # Check DB row
        db_state = session.query(ClockState).filter(ClockState.id == 1).first()
        assert db_state is not None
        assert db_state.offset_seconds == expected_offset

        # Reset clock
        clock.reset(db=session)
        assert clock.get_offset() == 0
        session.refresh(db_state)
        assert db_state.offset_seconds == 0
    finally:
        session.close()


# ── Policy Engine Tests ────────────────────────────────────────────────────────

def test_policy_defaults_and_versioning():
    """Verify default SRS §6.4 parameters, cache lookups, and version updating."""
    session = SessionLocal()
    try:
        # Check standard defaults
        assert policy.get("deposit_term_years") == 10
        assert policy.get("favouring_names") == ["Member Secretary, AICTE"]
        assert policy.get("step_up_ttl_minutes") == 5
        assert policy.get("recon_freshness_days") == 90
        assert policy.get("non_existent_key", "fallback_val") == "fallback_val"

        # Update a policy parameter
        new_version = policy.update_policies({"deposit_term_years": 15}, db=session)
        assert new_version.version_number >= 2
        assert policy.get("deposit_term_years") == 15

        # Restore original for subsequent tests
        policy.update_policies({"deposit_term_years": 10}, db=session)
        assert policy.get("deposit_term_years") == 10
    finally:
        session.close()


# ── API Route Integration Tests ────────────────────────────────────────────────

def test_api_audit_endpoints():
    """Verify /api/audit list and verify endpoints, and role guards."""
    admin_token = get_token("admin1")
    auditor_token = get_token("aud1")
    institute_token = get_token("ar_sig")

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    auditor_headers = {"Authorization": f"Bearer {auditor_token}"}
    institute_headers = {"Authorization": f"Bearer {institute_token}"}

    # 1. Auditor can view audit log
    res = client.get("/api/audit?page=1&page_size=10", headers=auditor_headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) <= 10
    assert data["total"] >= 1

    # 2. Filter by action
    res_filter = client.get("/api/audit?action=GENESIS_INITIALIZED", headers=auditor_headers)
    assert res_filter.status_code == 200
    filter_data = res_filter.json()
    assert filter_data["total"] >= 1
    assert filter_data["items"][0]["action"] == "GENESIS_INITIALIZED"

    # 3. Institute cannot view audit log (403 Forbidden)
    res_inst = client.get("/api/audit", headers=institute_headers)
    assert res_inst.status_code == 403

    # 4. Verify endpoint
    res_verify = client.get("/api/audit/verify", headers=auditor_headers)
    assert res_verify.status_code == 200
    assert res_verify.json()["ok"] is True

    # 5. Tamper and Repair demo endpoints (Admin only)
    tamper_res = client.post(
        "/api/admin/audit/tamper-demo",
        json={"seq": 10},
        headers=admin_headers,
    )
    assert tamper_res.status_code == 200
    assert tamper_res.json()["status"] == "tampered"

    # Verification must fail at seq 10
    check_res = client.get("/api/audit/verify", headers=auditor_headers)
    assert check_res.status_code == 200
    assert check_res.json()["ok"] is False
    assert check_res.json()["first_broken_seq"] == 10

    # Repair via admin endpoint
    repair_res = client.post(
        "/api/admin/audit/repair-demo",
        json={"from_seq": 10},
        headers=admin_headers,
    )
    assert repair_res.status_code == 200
    assert repair_res.json()["status"] == "repaired"

    # Verification passes again
    check_res2 = client.get("/api/audit/verify", headers=auditor_headers)
    assert check_res2.status_code == 200
    assert check_res2.json()["ok"] is True


def test_api_clock_endpoints():
    """Verify /api/admin/clock endpoints, time travel, and audit trail generation."""
    admin_token = get_token("admin1")
    so_token = get_token("so1")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    so_headers = {"Authorization": f"Bearer {so_token}"}

    # 1. GET /api/admin/clock is accessible without auth (for topbar layout)
    res = client.get("/api/admin/clock")
    assert res.status_code == 200
    clock_data = res.json()
    assert "now" in clock_data
    assert "offset_seconds" in clock_data

    # 2. Non-admin cannot advance clock (403 Forbidden)
    res_so = client.post("/api/admin/clock/advance", json={"days": 1}, headers=so_headers)
    assert res_so.status_code == 403

    # 3. Admin advances clock by 5 days
    res_adv = client.post("/api/admin/clock/advance", json={"days": 5}, headers=admin_headers)
    assert res_adv.status_code == 200
    assert res_adv.json()["offset_seconds"] == 5 * 86400

    # 4. Reset clock
    res_reset = client.post("/api/admin/clock/reset", headers=admin_headers)
    assert res_reset.status_code == 200
    assert res_reset.json()["offset_seconds"] == 0


def test_api_policy_endpoints():
    """Verify /api/policy endpoints and parameter lookups."""
    admin_token = get_token("admin1")
    inst_token = get_token("ar_sig")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    inst_headers = {"Authorization": f"Bearer {inst_token}"}

    # 1. Admin gets all policies
    res = client.get("/api/policy", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["deposit_term_years"] == 10
    assert "amount_table" in data

    # 2. Admin queries single key
    res_key = client.get("/api/policy?key=deposit_term_years", headers=admin_headers)
    assert res_key.status_code == 200
    assert res_key.json() == {"key": "deposit_term_years", "value": 10}

    # 3. Institute cannot query policy endpoint (403)
    res_inst = client.get("/api/policy", headers=inst_headers)
    assert res_inst.status_code == 403


# ── Code Hygiene: Ban datetime.now() in Business Logic ─────────────────────────

def test_banned_datetime_now():
    """Ensure datetime.now() and datetime.utcnow() are banned across backend/app/ except clock.py."""
    backend_app_dir = Path(__file__).resolve().parent.parent.parent / "app"
    pattern = re.compile(r"datetime\.(now|utcnow)\(")

    violators = []
    for py_file in backend_app_dir.rglob("*.py"):
        # Exclude clock.py itself
        if py_file.name == "clock.py":
            continue
        content = py_file.read_text(encoding="utf-8")
        matches = pattern.findall(content)
        if matches:
            violators.append(f"{py_file.relative_to(backend_app_dir)}: {matches}")

    assert not violators, f"Banned datetime.now() or datetime.utcnow() found in: {violators}"

