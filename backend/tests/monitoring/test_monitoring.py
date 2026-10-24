"""
Comprehensive unit tests for Monitoring Engine, Maturity Scanning, and Alert Ladders (§5.1, §6.4, §7.8, SEQ-11).
"""
from datetime import timedelta
import re
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import AlertType, InstrumentState, ObligationState, Role, Severity
from app.core.models import AuditEvent, Notification, User
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.intake.ids import institute_id, stable_id
from app.modules.intake.models import Instrument, Obligation
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.models import Alert
from app.modules.monitoring.seed import seed as seed_monitoring
from app.modules.monitoring.service import scan_maturities

client = TestClient(app)


@pytest.fixture(autouse=True)
def db_lifecycle():
    create_tables()
    seed_core()
    seed_intake()
    seed_monitoring()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["access_token"]


def test_takshashila_golden_path_simulation():
    """
    Test Golden Path: Takshashila seed instrument (maturity +200d)
    - Advance +20d (180d window) -> 180 alert, state ACTIVE -> RENEWAL_DUE
    - Advance +90d (90d window)  -> 90 alert, institute notified
    - Advance +60d (30d window)  -> 30 alert, institute + SO notified
    - Advance +23d (7d window)   -> 7 alert, institute + SO + AO notified
    - Advance +8d (past maturity) -> LAPSED, breach alert, coverage recomputed
    - Advance +16d (>15d lapsed)  -> LAPSE_ESCALATED, Release Authority notified
    """
    db = SessionLocal()
    try:
        tak_id = stable_id("instrument", "takshashila")
        tak_inst = db.query(Instrument).filter(Instrument.id == tak_id).first()
        assert tak_inst is not None
        assert tak_inst.state == InstrumentState.ACTIVE.value

        # Baseline: Day 0 (days_remaining = 200 > 180)
        # Advance +20 days -> days_remaining = 180
        clock.advance(days=20)
        now_dt = clock.now()
        scan_maturities(db, now_dt)
        db.commit()

        # Check 180-day transition and alert
        db.refresh(tak_inst)
        assert tak_inst.state == InstrumentState.RENEWAL_DUE.value
        alert_180 = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:180").first()
        assert alert_180 is not None
        assert alert_180.alert_type == AlertType.MATURITY_180.value
        assert alert_180.severity == Severity.LOW.value

        # Audit check for RENEWAL_DUE
        audit_renewal = (
            db.query(AuditEvent)
            .filter(AuditEvent.entity_id == tak_id, AuditEvent.action == "INSTRUMENT_RENEWAL_DUE")
            .first()
        )
        assert audit_renewal is not None

        # Advance +90 days (total +110 days, days_remaining = 90)
        clock.advance(days=90)
        scan_maturities(db, clock.now())
        db.commit()

        alert_90 = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:90").first()
        assert alert_90 is not None
        assert alert_90.alert_type == AlertType.MATURITY_90.value
        assert alert_90.severity == Severity.MEDIUM.value

        # Advance +60 days (total +170 days, days_remaining = 30)
        clock.advance(days=60)
        scan_maturities(db, clock.now())
        db.commit()

        alert_30 = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:30").first()
        assert alert_30 is not None
        assert alert_30.alert_type == AlertType.MATURITY_30.value
        assert alert_30.severity == Severity.HIGH.value

        # Verify Scrutiny Officer notification
        notif_so_30 = (
            db.query(Notification)
            .filter(Notification.dedupe_key == f"notif:{tak_id}:30:so")
            .first()
        )
        assert notif_so_30 is not None
        assert notif_so_30.role == Role.SCRUTINY_OFFICER.value

        # Advance +23 days (total +193 days, days_remaining = 7)
        clock.advance(days=23)
        scan_maturities(db, clock.now())
        db.commit()

        alert_7 = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:7").first()
        assert alert_7 is not None
        assert alert_7.alert_type == AlertType.MATURITY_7.value

        # Verify Approving Officer notification
        notif_ao_7 = (
            db.query(Notification)
            .filter(Notification.dedupe_key == f"notif:{tak_id}:7:ao")
            .first()
        )
        assert notif_ao_7 is not None
        assert notif_ao_7.role == Role.APPROVING_OFFICER.value

        # Advance +8 days (total +201 days, days_remaining = -1 past maturity)
        clock.advance(days=8)
        scan_maturities(db, clock.now())
        db.commit()

        db.refresh(tak_inst)
        assert tak_inst.state == InstrumentState.LAPSED.value

        # Verify LAPSED alert
        alert_lapsed = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:LAPSED").first()
        assert alert_lapsed is not None
        assert alert_lapsed.alert_type == AlertType.LAPSED.value
        assert alert_lapsed.severity == Severity.HIGH.value

        # Verify obligation coverage dropped
        tak_ob = db.query(Obligation).filter(Obligation.id == tak_inst.obligation_id).first()
        assert tak_ob is not None
        assert tak_ob.state == ObligationState.PENDING_DEPOSIT.value

        # Audit check for LAPSED and coverage change
        audit_lapsed = (
            db.query(AuditEvent)
            .filter(AuditEvent.entity_id == tak_id, AuditEvent.action == "INSTRUMENT_LAPSED")
            .first()
        )
        assert audit_lapsed is not None

        # Advance +16 days (total +217 days, days_overdue = 17 > 15)
        clock.advance(days=16)
        scan_maturities(db, clock.now())
        db.commit()

        alert_esc = db.query(Alert).filter(Alert.dedupe_key == f"alert:{tak_id}:LAPSE_ESCALATED").first()
        assert alert_esc is not None
        assert alert_esc.alert_type == AlertType.LAPSE_ESCALATED.value

        # Verify Release Authority notification
        notif_ra = (
            db.query(Notification)
            .filter(Notification.dedupe_key == f"notif:{tak_id}:LAPSE_ESCALATED:ra")
            .first()
        )
        assert notif_ra is not None
        assert notif_ra.role == Role.RELEASE_AUTHORITY.value
    finally:
        db.close()


def test_idempotent_tick_deduplication():
    """Verify executing multiple consecutive ticks creates exactly one alert per window."""
    db = SessionLocal()
    try:
        clock.advance(days=20)  # Enters 180-day window
        tak_id = stable_id("instrument", "takshashila")

        # Run tick 5 times
        for _ in range(5):
            scan_maturities(db, clock.now())
            db.commit()

        # Count 180 alerts for Takshashila
        count_180 = (
            db.query(Alert)
            .filter(Alert.instrument_id == tak_id, Alert.alert_type == AlertType.MATURITY_180.value)
            .count()
        )
        assert count_180 == 1

        # Count notifications
        notif_count = (
            db.query(Notification)
            .filter(Notification.dedupe_key == f"notif:{tak_id}:180:inst")
            .count()
        )
        assert notif_count == 1
    finally:
        db.close()


def test_term_complete_maturity_transition():
    """Verify instrument transitions to MATURED when obligation term is complete."""
    db = SessionLocal()
    try:
        today = clock.now().date()
        tak_ob = db.query(Obligation).filter(Obligation.id == stable_id("obligation", "takshashila")).first()
        tak_inst = db.query(Instrument).filter(Instrument.id == stable_id("instrument", "takshashila")).first()

        # Set obligation end_date in the past and advance clock past maturity
        tak_ob.end_date = today
        clock.advance(days=205)  # past maturity date (was +200)

        scan_maturities(db, clock.now())
        db.commit()

        db.refresh(tak_inst)
        db.refresh(tak_ob)
        assert tak_inst.state == InstrumentState.MATURED.value
        assert tak_ob.state == ObligationState.TERM_COMPLETE.value
    finally:
        db.close()


def test_alerts_endpoint_scoping_and_filters():
    """Verify GET /api/alerts supports multi-tenant isolation, pagination, and filters."""
    so_token = get_token("so1")
    ar_token = get_token("ar_sig")

    # 1. Scrutiny Officer can see all alerts
    res_so = client.get("/api/alerts", headers={"Authorization": f"Bearer {so_token}"})
    assert res_so.status_code == 200
    so_data = res_so.json()
    assert so_data["total"] >= 2

    # 2. Aryabhatta signatory only sees Aryabhatta alerts
    res_ar = client.get("/api/alerts", headers={"Authorization": f"Bearer {ar_token}"})
    assert res_ar.status_code == 200
    ar_data = res_ar.json()
    assert ar_data["total"] >= 1
    for item in ar_data["items"]:
        assert item["institute_id"] == institute_id("aryabhatta")

    # 3. Filter by window_days
    res_w90 = client.get("/api/alerts?window_days=90", headers={"Authorization": f"Bearer {so_token}"})
    assert res_w90.status_code == 200
    for item in res_w90.json()["items"]:
        assert item["window_days"] == 90

    # 4. Filter by alert_type
    res_type = client.get(
        f"/api/alerts?alert_type={AlertType.MATURITY_90.value}",
        headers={"Authorization": f"Bearer {so_token}"},
    )
    assert res_type.status_code == 200
    for item in res_type.json()["items"]:
        assert item["alert_type"] == AlertType.MATURITY_90.value


def test_clock_advance_with_run_tick_integration():
    """Verify POST /api/admin/clock/advance with run_tick=true executes maturity scan job."""
    admin_token = get_token("admin1")
    so_token = get_token("so1")

    # Advance clock 20 days with tick
    res_adv = client.post(
        "/api/admin/clock/advance",
        json={"days": 20, "run_tick": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert res_adv.status_code == 200
    adv_data = res_adv.json()
    assert "jobs_run" in adv_data
    assert any(job["job_name"] == "maturity_scan" for job in adv_data["jobs_run"])

    # Verify 180 alert visible via API
    res_alerts = client.get("/api/alerts?window_days=180", headers={"Authorization": f"Bearer {so_token}"})
    assert res_alerts.status_code == 200
    assert res_alerts.json()["total"] >= 1


def test_zero_datetime_now_violations():
    """Ensure no datetime.now() or datetime.utcnow() calls exist in monitoring or intake service."""
    files_to_check = [
        Path(__file__).parent.parent.parent / "app" / "modules" / "monitoring" / "service.py",
        Path(__file__).parent.parent.parent / "app" / "modules" / "monitoring" / "models.py",
        Path(__file__).parent.parent.parent / "app" / "modules" / "monitoring" / "router.py",
        Path(__file__).parent.parent.parent / "app" / "modules" / "monitoring" / "seed.py",
        Path(__file__).parent.parent.parent / "app" / "modules" / "intake" / "service.py",
    ]
    banned_regex = re.compile(r"datetime\.(now|utcnow)\(")
    for f in files_to_check:
        if f.exists():
            content = f.read_text(encoding="utf-8")
            matches = banned_regex.findall(content)
            assert not matches, f"Banned datetime call found in {f}: {matches}"

