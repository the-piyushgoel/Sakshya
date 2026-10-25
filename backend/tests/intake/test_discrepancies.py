import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import InstrumentState
from app.core.errors import InvalidStateError
from app.core.models import AuditEvent, Notification, User
from app.core.notify import get_notifications
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake import service
from app.modules.intake.ids import stable_id
from app.modules.intake.models import Discrepancy, Instrument, InstrumentStateHistory
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(autouse=True)
def full_seed():
    create_tables()
    # Same dependency order as scripts/seed_all.py (release/insights have no seed module).
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    yield
    drop_tables()
    clock.reset()


def auth(username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def resolve(discrepancy_slug: str, action: str, note: str = "Reviewed evidence"):
    return client.post(
        f"/api/discrepancies/{stable_id('discrepancy', discrepancy_slug)}/resolve",
        json={"action": action, "note": note}, headers=auth("so1"),
    )


def test_resolve_clear_escalate_reject_and_high_requires_note():
    no_note = resolve("filler-06", "CLEAR", "   ")
    assert no_note.status_code == 422
    assert no_note.json()["error"]["code"] == "VALIDATION_ERROR"

    clear = resolve("filler-02", "CLEAR")
    assert clear.status_code == 200, clear.text
    assert clear.json()["status"] == "CLEARED"
    assert clear.json()["resolved_by"]
    assert clear.json()["resolution_note"] == "Reviewed evidence"

    escalate = resolve("filler-06", "ESCALATE")
    assert escalate.status_code == 200, escalate.text
    assert escalate.json()["status"] == "ESCALATED"

    rejected = resolve("filler-10", "REJECT")
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "REJECTED"
    db = SessionLocal()
    try:
        assert db.query(Instrument).filter_by(id=stable_id("instrument", "filler-10")).one().state == "BANK_PENDING"
    finally:
        db.close()

def test_resolve_repeat_and_institute_role_are_rejected():
    first = resolve("filler-02", "CLEAR")
    assert first.status_code == 200
    again = resolve("filler-02", "CLEAR")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "INVALID_STATE"
    forbidden = client.post(
        f"/api/discrepancies/{stable_id('discrepancy', 'filler-02')}/resolve",
        json={"action": "CLEAR", "note": "Not allowed"}, headers=auth("ar_sig"),
    )
    assert forbidden.status_code == 403


def test_last_high_resolution_returns_discrepancy_instrument_to_scrutiny():
    db = SessionLocal()
    try:
        instrument = db.query(Instrument).filter_by(id=stable_id("instrument", "filler-06")).one()
        instrument.state = InstrumentState.DISCREPANCY.value
        db.commit()
    finally:
        db.close()
    response = resolve("filler-06", "CLEAR")
    assert response.status_code == 200, response.text
    db = SessionLocal()
    try:
        instrument = db.query(Instrument).filter_by(id=stable_id("instrument", "filler-06")).one()
        assert instrument.state == InstrumentState.SCRUTINY.value
        assert instrument.scrutiny_officer_id == db.query(User).filter_by(username="so1").one().id
    finally:
        db.close()


def test_has_open_high_predicate_and_quarantine_guard():
    instrument_id = stable_id("instrument", "filler-02")
    assert service.has_open_high(instrument_id)
    db = SessionLocal()
    try:
        discrepancy = db.query(Discrepancy).filter_by(id=stable_id("discrepancy", "filler-02")).one()
        discrepancy.status = "ESCALATED"
        db.commit()
        assert service.has_open_high(instrument_id)
        discrepancy.status = "CLEARED"
        db.commit()
        assert not service.has_open_high(instrument_id)

        instrument = db.query(Instrument).filter_by(id=instrument_id).one()
        instrument.is_quarantined = True
        db.commit()
        with pytest.raises(InvalidStateError):
            service.ensure_not_quarantined(instrument_id)
    finally:
        db.close()


def test_quarantine_persists_audit_and_compliance_notification():
    instrument_id = stable_id("instrument", "filler-00")
    headers = auth("ao2")
    response = client.post(f"/api/instruments/{instrument_id}/quarantine", json={"reason": "Vigilance review"}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["is_quarantined"] is True
    detail = client.get(f"/api/instruments/{instrument_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["is_quarantined"] is True

    db = SessionLocal()
    try:
        assert db.query(AuditEvent).filter_by(action="INSTRUMENT_QUARANTINED", entity_id=instrument_id).count() == 1
        notification = db.query(Notification).filter_by(role="COMPLIANCE_OFFICER").filter(
            Notification.title.like("QUARANTINE_VIGILANCE%")
        ).one()
        assert notification.body and instrument_id in notification.body
        compliance_officer = db.query(User).filter_by(username="co1").one()
        assert "COMPLIANCE_OFFICER" in compliance_officer.roles
        visible, _ = get_notifications(compliance_officer, db=db)
        assert notification.id in {item.id for item in visible}
    finally:
        db.close()

    repeated = client.post(f"/api/instruments/{instrument_id}/quarantine", json={"reason": "Again"}, headers=headers)
    assert repeated.status_code == 409
    assert repeated.json()["error"]["code"] == "INVALID_STATE"
    forbidden = client.post(
        f"/api/instruments/{stable_id('instrument', 'filler-00')}/quarantine",
        json={"reason": "No role"}, headers=auth("ar_sig"),
    )
    assert forbidden.status_code == 403


def test_reject_scrutiny_has_history_active_is_invalid_and_institute_is_forbidden():
    instrument_id = stable_id("instrument", "filler-01")
    response = client.post(
        f"/api/instruments/{instrument_id}/reject", json={"reason": "Eligibility concern"}, headers=auth("ao2"),
    )
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "REJECTED"
    db = SessionLocal()
    try:
        history = db.query(InstrumentStateHistory).filter_by(instrument_id=instrument_id).order_by(
            InstrumentStateHistory.at.desc()
        ).first()
        assert history.to_state == "REJECTED"
        assert history.reason == "Eligibility concern"
    finally:
        db.close()

    active_id = stable_id("instrument", "filler-00")
    active = client.post(
        f"/api/instruments/{active_id}/reject", json={"reason": "Must remain active"}, headers=auth("ao2"),
    )
    assert active.status_code == 409
    assert active.json()["error"]["code"] == "INVALID_STATE"
    forbidden = client.post(
        f"/api/instruments/{active_id}/reject", json={"reason": "No role"}, headers=auth("ar_sig"),
    )
    assert forbidden.status_code == 403
