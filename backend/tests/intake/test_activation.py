from pathlib import Path

import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.models import AuditEvent
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.ids import stable_id
from app.modules.intake.models import (
    Discrepancy,
    FieldTrust,
    Instrument,
    InstrumentStateHistory,
)
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from fastapi.testclient import TestClient

client = TestClient(app)
SAMPLE = Path(__file__).resolve().parents[3] / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"


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
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def step_up(headers):
    response = client.post("/api/auth/step-up", headers=headers, json={"pin": "246810"})
    assert response.status_code == 200, response.text


def confirmed_instrument(principal_paise=250000000):
    signatory = auth("ar_sig")
    response = client.post(
        "/api/instruments", headers=signatory,
        files={"file": (SAMPLE.name, SAMPLE.read_bytes(), "application/pdf")},
        data={
            "obligation_id": stable_id("obligation", "aryabhatta"),
            "fdr_number": "BRB-FDR-2024-000101", "bank_ifsc": "BRBK0001234",
            "principal_paise": principal_paise, "issue_date": "2024-01-15",
            "maturity_date": "2027-01-15", "interest_rate_pct": "7.25",
            "holder_names": "Aryabhatta Trust",
        },
    )
    assert response.status_code == 200, response.text
    instrument_id = response.json()["id"]
    ao1 = auth("ao1")
    request = client.post("/api/bank-requests", headers=ao1, json={
        "instrument_id": instrument_id, "reason": "PY-5a activation test",
    })
    assert request.status_code == 200, request.text
    request_id = request.json()["id"]
    maker = auth("brb_mk")
    assert client.get(f"/api/bank/requests/{request_id}", headers=maker).status_code == 200
    checklist = [{"item_no": n, "question": f"Check {n}", "answer": True, "remarks": "Verified"}
                 for n in range(1, 13)]
    assert client.post(f"/api/bank/requests/{request_id}/maker-submit", headers=maker,
                       json={"checklist": checklist, "outcome": "ALL_CLEAR"}).status_code == 200
    decision = client.post(f"/api/bank/requests/{request_id}/checker-decision", headers=auth("brb_ck"),
                           json={"decision": "AUTHORISE"})
    assert decision.status_code == 200, decision.text
    return instrument_id


def test_activation_guards_missing_l2_high_discrepancy_quarantine_and_roles():
    instrument_id = stable_id("instrument", "filler-01")  # seeded SCRUTINY, L2
    db = SessionLocal()
    try:
        field = db.query(FieldTrust).filter_by(
            instrument_id=instrument_id, field_name="principal_paise",
        ).one()
        field.trust = "L0_CLAIMED"
        db.commit()
    finally:
        db.close()
    ao2 = auth("ao2")
    step_up(ao2)
    missing = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert missing.status_code == 409
    assert missing.json()["error"]["details"]["missing_fields"]

    # Restore the field and add a blocking D-07.
    db = SessionLocal()
    try:
        fields = db.query(FieldTrust).filter_by(instrument_id=instrument_id).all()
        for field in fields:
            field.trust = "L2_BANK_CONFIRMED"
        db.add(Discrepancy(id="test-activation-d07", instrument_id=instrument_id, code="D-07",
                           severity="HIGH", status="OPEN", details_json={}, created_at=clock.now()))
        db.commit()
    finally:
        db.close()
    blocked = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert blocked.status_code == 409
    assert blocked.json()["error"]["details"]["discrepancy_codes"] == ["D-07"]

    db = SessionLocal()
    try:
        db.query(Discrepancy).filter_by(id="test-activation-d07").delete()
        db.query(Instrument).filter_by(id=instrument_id).one().is_quarantined = True
        db.commit()
    finally:
        db.close()
    quarantined = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert quarantined.status_code == 409
    assert quarantined.json()["error"]["code"] == "INVALID_STATE"
    assert client.post(f"/api/instruments/{instrument_id}/activate", headers=auth("ar_sig")).status_code == 403


def test_activation_step_up_sod_full_coverage_and_audit():
    instrument_id = confirmed_instrument()
    ao2 = auth("ao2")
    no_step = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert no_step.status_code == 403
    assert no_step.json()["error"]["code"] == "STEP_UP_REQUIRED"
    step_up(ao2)
    # AO1 created the bank request and was assigned as scrutiny officer.
    ao1 = auth("ao1")
    step_up(ao1)
    sod_response = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao1)
    assert sod_response.status_code == 403
    assert sod_response.json()["error"]["code"] == "SOD_VIOLATION"

    obligation_id = stable_id("obligation", "aryabhatta")
    before = client.get(f"/api/obligations/{obligation_id}", headers=ao2).json()
    assert before["state"] == "PENDING_DEPOSIT"
    activated = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert activated.status_code == 200, activated.text
    assert activated.json()["state"] == "ACTIVE"
    after = client.get(f"/api/obligations/{obligation_id}", headers=ao2).json()
    assert after["state"] == "COVERED"
    db = SessionLocal()
    try:
        assert db.query(InstrumentStateHistory).filter_by(
            instrument_id=instrument_id, to_state="ACTIVE",
        ).count() == 1
        assert db.query(AuditEvent).filter_by(
            entity_type="INSTRUMENT", entity_id=instrument_id, action="INSTRUMENT_ACTIVATED",
        ).count() == 1
    finally:
        db.close()


def test_smaller_confirmed_instrument_produces_partial_coverage():
    instrument_id = confirmed_instrument(250000000)
    db = SessionLocal()
    try:
        principal = db.query(FieldTrust).filter_by(
            instrument_id=instrument_id, field_name="principal_paise",
        ).one()
        principal.value = "100000000"
        db.commit()
    finally:
        db.close()
    ao2 = auth("ao2")
    step_up(ao2)
    result = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
    assert result.status_code == 200, result.text
    obligation = client.get(f"/api/obligations/{stable_id('obligation', 'aryabhatta')}", headers=ao2).json()
    assert obligation["state"] == "PARTIALLY_COVERED"
