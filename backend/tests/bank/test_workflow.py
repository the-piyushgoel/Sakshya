import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.models import AuditEvent
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank import service
from app.modules.bank.ids import stable_id
from app.modules.bank.models import BankRequest
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.models import Discrepancy, FieldTrust, Instrument
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from fastapi.testclient import TestClient

client = TestClient(app)
REQ = stable_id("bank-request", "filler-02")


@pytest.fixture(autouse=True)
def full_seed():
    create_tables()
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    yield
    drop_tables()
    clock.reset()


def auth(username):
    result = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert result.status_code == 200
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def checklist(false_no=None):
    return [{"item_no": n, "question": f"Item {n}", "answer": n != false_no,
             "remarks": "Exception details" if n == false_no else None} for n in range(1, 13)]


def submit(outcome="ALL_CLEAR", items=None, username="brb_mk"):
    # Opening request acknowledges it, as required by the bank workflow.
    client.get(f"/api/bank/requests/{REQ}", headers=auth(username))
    return client.post(f"/api/bank/requests/{REQ}/maker-submit", headers=auth(username), json={
        "checklist": items if items is not None else checklist(), "outcome": outcome,
        "remarks": "Maker checked against CBS",
    })


def test_all_clear_confirmation_upgrades_fields_and_returns_to_scrutiny():
    assert submit().status_code == 200
    result = client.post(f"/api/bank/requests/{REQ}/checker-decision", headers=auth("brb_ck"),
                         json={"decision": "AUTHORISE"})
    assert result.json()["state"] == "CONFIRMED"
    db = SessionLocal()
    try:
        instrument = db.query(Instrument).filter_by(id=stable_id("instrument", "filler-02")).one()
        assert instrument.state == "SCRUTINY"
        fields = db.query(FieldTrust).filter_by(instrument_id=instrument.id).all()
        assert {f.field_name for f in fields if f.trust == "L2_BANK_CONFIRMED"} >= {
            "principal_paise", "maturity_date", "favouring", "holder_names", "lien_marked",
            "lien_ref", "issue_date", "interest_rate_pct", "bank_ifsc", "fdr_number",
        }
        assert service.latest_confirmation(instrument.id)["outcome"] == "ALL_CLEAR"
        assert db.query(AuditEvent).filter_by(entity_type="BANK_REQUEST", entity_id=REQ).count() >= 3
    finally:
        db.close()


def test_checker_maker_sod_and_wrong_bank_scope():
    db = SessionLocal()
    try:
        from app.core.models import User
        checker = db.query(User).filter_by(username="brb_ck").one()
        checker.roles_json = checker.roles + ["BANK_MAKER"]
        db.commit()
    finally:
        db.close()
    assert submit(username="brb_ck").status_code == 200
    assert client.post(f"/api/bank/requests/{REQ}/checker-decision", headers=auth("brb_ck"),
                       json={"decision": "AUTHORISE"}).json()["error"]["code"] == "SOD_VIOLATION"
    assert client.get(f"/api/bank/requests/{REQ}", headers=auth("hcb_mk")).status_code == 404
    assert client.post(f"/api/bank/requests/{REQ}/maker-submit", headers=auth("hcb_mk"),
                       json={"checklist": checklist(), "outcome": "ALL_CLEAR"}).status_code == 404


def test_not_found_and_exceptions_create_discrepancies():
    assert submit("NOT_FOUND").status_code == 200
    result = client.post(f"/api/bank/requests/{REQ}/checker-decision", headers=auth("brb_ck"),
                         json={"decision": "AUTHORISE"})
    assert result.json()["state"] == "NOT_FOUND"
    db = SessionLocal()
    try:
        disc = db.query(Discrepancy).filter_by(
            instrument_id=stable_id("instrument", "filler-02"), code="D-02",
        ).order_by(Discrepancy.created_at.desc()).first()
        assert disc.details_json["quarantine_suggested"] is True
        assert not db.query(Instrument).filter_by(id=stable_id("instrument", "filler-02")).one().is_quarantined
    finally:
        db.close()


def test_exception_authorisation_maps_no_answer_without_l2():
    assert submit("EXCEPTIONS", checklist(7)).status_code == 200
    result = client.post(f"/api/bank/requests/{REQ}/checker-decision", headers=auth("brb_ck"),
                         json={"decision": "AUTHORISE"})
    assert result.json()["state"] == "CONFIRMED_WITH_EXCEPTIONS"
    db = SessionLocal()
    try:
        instrument_id = stable_id("instrument", "filler-02")
        assert db.query(Discrepancy).filter_by(
            instrument_id=instrument_id, code="D-14",
        ).count() == 1
        assert db.query(FieldTrust).filter_by(
            instrument_id=instrument_id, evidence_ref=REQ,
        ).count() == 0
        assert db.query(Instrument).filter_by(id=instrument_id).one().state == "DISCREPANCY"
    finally:
        db.close()


def test_validation_return_resubmit_and_outsider_response():
    headers = auth("brb_mk")
    client.get(f"/api/bank/requests/{REQ}", headers=headers)
    url = f"/api/bank/requests/{REQ}/maker-submit"
    assert client.post(url, headers=headers, json={"checklist": checklist(2), "outcome": "ALL_CLEAR"}).json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.post(url, headers=headers, json={"checklist": checklist()[:-1], "outcome": "ALL_CLEAR"}).status_code == 422
    assert client.post(url, headers=headers, json={"checklist": checklist(2), "outcome": "EXCEPTIONS"}).status_code == 200
    assert client.post(f"/api/bank/requests/{REQ}/checker-decision", headers=auth("brb_ck"),
                       json={"decision": "RETURN", "remarks": "Please recheck"}).json()["state"] == "ACKNOWLEDGED"
    assert client.post(url, headers=headers, json={"checklist": checklist(), "outcome": "ALL_CLEAR"}).status_code == 200
    before = service.receive_response_from_contact(REQ, "outsider@example.test", {})
    assert before["rejected"] is True
    db = SessionLocal()
    try:
        request = db.query(BankRequest).filter_by(id=REQ).one()
        assert request.state == "MAKER_SUBMITTED"
        assert db.query(Discrepancy).filter_by(instrument_id=request.instrument_id, code="D-13").count() == 1
    finally:
        db.close()
