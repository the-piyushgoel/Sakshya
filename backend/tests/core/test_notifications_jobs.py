"""
Unit and integration tests for PR-4:
- Notifications Subsystem (scoping, deduplication, unread counters, mark-read) (§3.4, §7.8)
- Job Registry & Scheduled Tick Runner (§1.3, §3.5)
"""
from datetime import datetime, timezone
from pathlib import Path
import re

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core import clock, jobs, notify
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import Role
from app.core.models import JobRun, Notification, User
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.intake.ids import institute_id

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_pr4_db():
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


# ── Notification Scoping & Deduplication Tests ─────────────────────────────────

def test_seeded_welcome_notifications():
    """Verify pre-seeded notifications are properly scoped on startup."""
    ar_headers = {"Authorization": f"Bearer {get_token('ar_sig')}"}
    so_headers = {"Authorization": f"Bearer {get_token('so1')}"}

    # Aryabhatta signatory should see their welcome notification
    res_ar = client.get("/api/notifications", headers=ar_headers)
    assert res_ar.status_code == 200
    data_ar = res_ar.json()
    assert data_ar["total"] >= 1
    titles_ar = [n["title"] for n in data_ar["items"]]
    assert "Welcome to Sakshya FDR Portal" in titles_ar

    # CRITICAL CHECK (§4): Institute user must NEVER see officer notifications
    assert "System Ready: Scrutiny Queue" not in titles_ar

    # Scrutiny Officer sees their scrutiny queue notification
    res_so = client.get("/api/notifications", headers=so_headers)
    assert res_so.status_code == 200
    data_so = res_so.json()
    titles_so = [n["title"] for n in data_so["items"]]
    assert "System Ready: Scrutiny Queue" in titles_so


def test_notify_send_deduplication():
    """Verify notify.send() with dedupe_key prevents duplicate entries (idempotency)."""
    session = SessionLocal()
    try:
        dedupe_key = "test:dedupe:unique_alert_101"

        # First call inserts notification
        n1 = notify.send(
            title="First alert",
            body="First description",
            dedupe_key=dedupe_key,
            db=session,
        )
        session.commit()
        assert n1 is not None

        # Second call with identical dedupe_key returns existing without creating new row
        n2 = notify.send(
            title="Second alert duplicate",
            body="Second description duplicate",
            dedupe_key=dedupe_key,
            db=session,
        )
        session.commit()
        assert n2.id == n1.id

        # Verify exactly one record in database
        count = session.query(Notification).filter(Notification.dedupe_key == dedupe_key).count()
        assert count == 1
    finally:
        session.close()


def test_strict_role_and_institute_scoping():
    """Verify institute signatories cannot see other institutes or officer notifications."""
    session = SessionLocal()
    try:
        # Create an Aryabhatta notification
        notify.send(
            title="Aryabhatta Private Alert",
            institute_id=institute_id("aryabhatta"),
            dedupe_key="scope:test:ar_only",
            db=session,
        )
        # Create a Vidya Jyoti notification
        notify.send(
            title="Vidya Jyoti Private Alert",
            institute_id=institute_id("vidyajyoti"),
            dedupe_key="scope:test:vj_only",
            db=session,
        )
        # Create an AICTE Scrutiny Officer notification
        notify.send(
            title="Confidential Officer Alert",
            role=Role.SCRUTINY_OFFICER,
            dedupe_key="scope:test:so_only",
            db=session,
        )
        session.commit()

        # Query as Aryabhatta signatory (ar_sig)
        ar_headers = {"Authorization": f"Bearer {get_token('ar_sig')}"}
        res_ar = client.get("/api/notifications", headers=ar_headers)
        assert res_ar.status_code == 200
        ar_titles = [n["title"] for n in res_ar.json()["items"]]

        assert "Aryabhatta Private Alert" in ar_titles
        assert "Vidya Jyoti Private Alert" not in ar_titles
        assert "Confidential Officer Alert" not in ar_titles

        # Query as Scrutiny Officer (so1)
        so_headers = {"Authorization": f"Bearer {get_token('so1')}"}
        res_so = client.get("/api/notifications", headers=so_headers)
        assert res_so.status_code == 200
        so_titles = [n["title"] for n in res_so.json()["items"]]

        assert "Confidential Officer Alert" in so_titles
        assert "Aryabhatta Private Alert" not in so_titles
        assert "Vidya Jyoti Private Alert" not in so_titles
    finally:
        session.close()


def test_notifications_unread_and_mark_read():
    """Verify unread counters, mark single as read, and mark all as read."""
    session = SessionLocal()
    try:
        user_ar = session.query(User).filter(User.username == "ar_sig").first()
        assert user_ar is not None

        # Send 2 new unique notifications to ar_sig
        n1 = notify.send(title="Item 1", user_id=user_ar.id, dedupe_key="test:read:1", db=session)
        n2 = notify.send(title="Item 2", user_id=user_ar.id, dedupe_key="test:read:2", db=session)
        session.commit()

        ar_headers = {"Authorization": f"Bearer {get_token('ar_sig')}"}

        # Check unread count
        res = client.get("/api/notifications", headers=ar_headers)
        assert res.status_code == 200
        initial_unread = res.json()["unread_count"]
        assert initial_unread >= 2

        # Mark 1 as read
        res_read_one = client.post(f"/api/notifications/{n1.id}/read", headers=ar_headers)
        assert res_read_one.status_code == 200
        assert res_read_one.json()["read"] is True

        res_after_one = client.get("/api/notifications", headers=ar_headers)
        assert res_after_one.json()["unread_count"] == initial_unread - 1

        # Mark all as read
        res_read_all = client.post("/api/notifications/read-all", headers=ar_headers)
        assert res_read_all.status_code == 200
        assert res_read_all.json()["marked_read"] >= 1

        res_after_all = client.get("/api/notifications", headers=ar_headers)
        assert res_after_all.json()["unread_count"] == 0
    finally:
        session.close()


# ── Job Registry & Scheduled Tick Tests ────────────────────────────────────────

def test_job_registry_and_tick_idempotency():
    """Verify registered jobs execute in order, and subsequent ticks within the same slot are skipped."""
    session = SessionLocal()
    try:
        admin_headers = {"Authorization": f"Bearer {get_token('admin1')}"}

        run_counter = {"count": 0}

        def mock_daily_job(db: Session, now_dt: datetime):
            run_counter["count"] += 1
            # Send notification deduped by date
            date_str = now_dt.strftime("%Y-%m-%d")
            notify.send(
                title=f"Maturity summary for {date_str}",
                role=Role.SCRUTINY_OFFICER,
                dedupe_key=f"maturity_summary:{date_str}",
                db=db,
            )
            return {"scanned": 10, "alerts_sent": 1}

        jobs.register("mock_daily_job", mock_daily_job)

        # 1. First tick execution -> should succeed
        res_tick_1 = client.post("/api/admin/tick", headers=admin_headers)
        assert res_tick_1.status_code == 200
        data_1 = res_tick_1.json()
        assert data_1["status"] == "ok"
        mock_job_res_1 = next(j for j in data_1["jobs_run"] if j["job_name"] == "mock_daily_job")
        assert mock_job_res_1["status"] == "SUCCESS"
        assert run_counter["count"] == 1

        # 2. Second tick at same simulated time -> should be SKIPPED
        res_tick_2 = client.post("/api/admin/tick", headers=admin_headers)
        assert res_tick_2.status_code == 200
        data_2 = res_tick_2.json()
        mock_job_res_2 = next(j for j in data_2["jobs_run"] if j["job_name"] == "mock_daily_job")
        assert mock_job_res_2["status"] == "SKIPPED"
        assert run_counter["count"] == 1  # Not executed again

        # 3. Third tick with force=true -> should re-execute
        res_tick_3 = client.post("/api/admin/tick?force=true", headers=admin_headers)
        assert res_tick_3.status_code == 200
        data_3 = res_tick_3.json()
        mock_job_res_3 = next(j for j in data_3["jobs_run"] if j["job_name"] == "mock_daily_job")
        assert mock_job_res_3["status"] == "SUCCESS"
        assert run_counter["count"] == 2
    finally:
        jobs.unregister("mock_daily_job")
        session.close()


def test_clock_advance_with_run_tick():
    """Verify advancing clock with run_tick=true runs all background jobs and records offset."""
    admin_headers = {"Authorization": f"Bearer {get_token('admin1')}"}

    res = client.post(
        "/api/admin/clock/advance",
        json={"days": 7, "run_tick": True},
        headers=admin_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["offset_seconds"] == 7 * 86400
    assert "jobs_run" in data
    assert len(data["jobs_run"]) >= 1

    # Reset clock
    client.post("/api/admin/clock/reset", headers=admin_headers)


# ── Code Hygiene: Ban datetime.now() ───────────────────────────────────────────

def test_banned_datetime_now_pr4():
    """Ensure datetime.now() and datetime.utcnow() are banned across backend/app/ except clock.py."""
    backend_app_dir = Path(__file__).resolve().parent.parent.parent / "app"
    pattern = re.compile(r"datetime\.(now|utcnow)\(")

    violators = []
    for py_file in backend_app_dir.rglob("*.py"):
        if py_file.name == "clock.py":
            continue
        content = py_file.read_text(encoding="utf-8")
        matches = pattern.findall(content)
        if matches:
            violators.append(f"{py_file.relative_to(backend_app_dir)}: {matches}")

    assert not violators, f"Banned datetime.now() or datetime.utcnow() found in: {violators}"
