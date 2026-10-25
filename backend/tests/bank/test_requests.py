import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import BankRequestState
from app.core.models import AuditEvent, User
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank import service
from app.modules.bank.ids import bank_id, stable_id
from app.modules.bank.models import BankNodalContact, BankRequest
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake import service as intake_service
from app.modules.intake.models import Instrument, InstrumentStateHistory
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(autouse=True)
def full_seed():
    create_tables()
    # Same seed order as scripts/seed_all.py; missing release/insights seed modules are skipped.
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


def test_scrutiny_officer_creates_directory_routed_request_and_transitions_instrument():
    instrument_id = stable_id("instrument", "filler-01")
    response = client.post("/api/bank-requests", headers=auth("so1"), json={
        "instrument_id": instrument_id, "reason": "Verify original bank record",
    })
    assert response.status_code == 200, response.text
    request = response.json()
    assert request["state"] == "NOTIFIED"

    db = SessionLocal()
    try:
        instrument = intake_service.get_instrument(instrument_id, db)
        assert instrument.state == "BANK_PENDING"
        assert instrument.scrutiny_officer_id == db.query(User).filter_by(username="so1").one().id
        bank_request = db.query(BankRequest).filter_by(id=request["id"]).one()
        contact = db.query(BankNodalContact).filter_by(id=bank_request.directory_contact_id).one()
        assert contact.bank_id == instrument.bank_id == bank_request.bank_id
        first_contact = db.query(BankNodalContact).filter_by(bank_id=instrument.bank_id).order_by(
            BankNodalContact.id,
        ).first()
        assert contact.id == first_contact.id
        assert bank_request.state == BankRequestState.NOTIFIED.value
        assert bank_request.notified_at is not None
        assert db.query(AuditEvent).filter_by(
            entity_type="BANK_REQUEST", entity_id=bank_request.id,
        ).count() == 2
        history = db.query(InstrumentStateHistory).filter_by(
            instrument_id=instrument_id, to_state="BANK_PENDING",
        ).one()
        assert history.from_state == "SCRUTINY"
    finally:
        db.close()

    duplicate = client.post("/api/bank-requests", headers=auth("ao2"), json={
        "instrument_id": instrument_id, "reason": "Try a second open request",
    })
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "INVALID_STATE"


def test_request_rejects_invalid_state_and_institute_user():
    active = client.post("/api/bank-requests", headers=auth("so1"), json={
        "instrument_id": stable_id("instrument", "filler-00"), "reason": "Check active FDR",
    })
    assert active.status_code == 409
    assert active.json()["error"]["code"] == "INVALID_STATE"

    forbidden = client.post("/api/bank-requests", headers=auth("ar_sig"), json={
        "instrument_id": stable_id("instrument", "filler-01"), "reason": "Not an officer",
    })
    assert forbidden.status_code == 403


def test_bank_directory_and_request_listing_detail_are_database_reads():
    headers = auth("so1")
    banks = client.get("/api/banks", headers=headers, params={"page_size": 2})
    assert banks.status_code == 200
    assert banks.json()["total"] == 3
    assert len(banks.json()["items"]) == 2
    contacts = client.get(f"/api/banks/{bank_id('BRB')}/nodal-contacts", headers=headers)
    assert contacts.status_code == 200
    assert contacts.json()["total"] == 2
    assert all(row["is_directory"] for row in contacts.json()["items"])

    request_id = stable_id("bank-request", "vidyajyoti")
    filtered = client.get("/api/bank-requests", headers=headers, params={
        "state": "CONFIRMED", "instrument_id": stable_id("instrument", "vidyajyoti"),
    })
    assert filtered.status_code == 200
    assert filtered.json()["total"] == len(filtered.json()["items"]) == 1
    detail = client.get(f"/api/bank-requests/{request_id}", headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["directory_contact"]["is_directory"] is True
    assert len(body["checklist"]) == 12
    assert body["instrument"]["id"] == stable_id("instrument", "vidyajyoti")
    assert "institute_id" not in body and "institute_name" not in body


def test_bank_inbox_scopes_to_bank_and_maker_acknowledges_only_once():
    brb_headers = auth("brb_mk")
    inbox = client.get("/api/bank/inbox", headers=brb_headers)
    assert inbox.status_code == 200
    assert inbox.json()["total"] == len(inbox.json()["items"]) >= 1
    db = SessionLocal()
    try:
        assert all(
            db.query(BankRequest).filter_by(id=item["id"]).one().bank_id == bank_id("BRB")
            for item in inbox.json()["items"]
        )
    finally:
        db.close()

    notified_id = stable_id("bank-request", "filler-02")
    opened = client.get(f"/api/bank/requests/{notified_id}", headers=brb_headers)
    assert opened.status_code == 200
    assert opened.json()["state"] == "ACKNOWLEDGED"
    opened_again = client.get(f"/api/bank/requests/{notified_id}", headers=brb_headers)
    assert opened_again.status_code == 200
    assert opened_again.json()["state"] == "ACKNOWLEDGED"
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter_by(id=notified_id).one()
        assert request.acknowledged_at is not None
        assert db.query(AuditEvent).filter_by(
            action="BANK_REQUEST_ACKNOWLEDGED", entity_id=notified_id,
        ).count() == 1
    finally:
        db.close()


def test_bank_user_cannot_open_another_bank_request():
    db = SessionLocal()
    try:
        candidates = db.query(Instrument).filter(
            Instrument.bank_id == bank_id("HCB"),
            Instrument.state.in_(("SCRUTINY", "BANK_PENDING", "DISCREPANCY")),
        ).order_by(Instrument.id).all()
        actor = db.query(User).filter_by(username="so1").one()
        candidate_id = next(
            instrument.id for instrument in candidates
            if not db.query(BankRequest.id).filter_by(instrument_id=instrument.id).first()
        )
    finally:
        db.close()

    request = service.create_request(candidate_id, actor, "Verify HCB instrument")
    response = client.get(f"/api/bank/requests/{request.id}", headers=auth("brb_mk"))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_latest_confirmation_returns_seeded_vidya_jyoti_confirmation_or_none():
    confirmation = service.latest_confirmation(stable_id("instrument", "vidyajyoti"))
    assert confirmation is not None
    assert confirmation["confirmed_at"] is not None
    assert confirmation["outcome"] == "ALL_CLEAR"
    assert service.latest_confirmation(stable_id("instrument", "takshashila")) is None
