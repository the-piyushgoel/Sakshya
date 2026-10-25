import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables, engine
from app.core.enums import InstrumentState
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake import service
from app.modules.intake.models import Discrepancy, Instrument
from app.modules.intake.seed import seed as seed_intake
from fastapi.testclient import TestClient
from sqlalchemy import text

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[3]
GENUINE_PDF = ROOT / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
RENEWAL_PDF = ROOT / "samples" / "out" / "fdr_renewal_aryabhatta.pdf"


@pytest.fixture(autouse=True)
def seeded_renewal_db():
    original_offset = clock.get_offset()
    try:
        create_tables()
        seed_core()
        seed_intake()
        seed_bank()
        target = datetime(2027, 1, 16, tzinfo=UTC)
        delta = max(0, (target - clock.now()).total_seconds())
        if delta:
            clock.advance(seconds=int(delta))
        yield
    finally:
        try:
            drop_tables()
        finally:
            clock.set_offset(original_offset)


def _login(username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _renew(headers, predecessor_id, *, number="BRB-FDR-2027-000202", maturity="2030-01-15"):
    return client.post(
        f"/api/instruments/{predecessor_id}/renew", headers=headers,
        files={"file": (RENEWAL_PDF.name, RENEWAL_PDF.read_bytes(), "application/pdf")},
        data={"mode": "NEW_NUMBER", "fdr_number": number, "bank_ifsc": "BRBK0001234",
              "principal_paise": "250000000", "issue_date": "2027-01-16",
              "maturity_date": maturity, "interest_rate_pct": "7.25",
              "holder_names": "Aryabhatta Trust"},
    )


def _bank_confirm(instrument_id: str, ao_headers: dict[str, str]) -> None:
    response = client.post(
        "/api/bank-requests", headers=ao_headers,
        json={"instrument_id": instrument_id, "reason": "Renewal bank confirmation"},
    )
    assert response.status_code == 200, response.text
    request_id = response.json()["id"]
    maker = _login("brb_mk")
    checklist = [{"item_no": n, "question": f"Renewal check {n}", "answer": True, "remarks": "Verified"}
                 for n in range(1, 13)]
    response = client.post(
        f"/api/bank/requests/{request_id}/maker-submit", headers=maker,
        json={"checklist": checklist, "outcome": "ALL_CLEAR", "remarks": "Renewal verified"},
    )
    assert response.status_code == 200, response.text
    response = client.post(
        f"/api/bank/requests/{request_id}/checker-decision", headers=_login("brb_ck"),
        json={"decision": "AUTHORISE", "remarks": "Renewal authorised"},
    )
    assert response.status_code == 200, response.text


def _activate(instrument_id: str, ao_headers: dict[str, str]):
    response = client.post("/api/auth/step-up", headers=ao_headers, json={"pin": "246810"})
    assert response.status_code == 200, response.text
    return client.post(f"/api/instruments/{instrument_id}/activate", headers=ao_headers)


def test_new_number_renewal_and_coverage_swap():
    assert GENUINE_PDF.exists() and RENEWAL_PDF.exists()
    with engine.connect() as connection:
        obligation_id = connection.execute(text(
            "SELECT obligation.id FROM obligation JOIN institute ON institute.id=obligation.institute_id "
            "WHERE institute.name LIKE 'Aryabhatta%'"
        )).scalar_one()

    ar_sig = _login("ar_sig")
    ao1 = _login("ao1")
    ao2 = _login("ao2")
    original = client.post(
        "/api/instruments", headers=ar_sig,
        files={"file": (GENUINE_PDF.name, GENUINE_PDF.read_bytes(), "application/pdf")},
        data={"obligation_id": obligation_id, "fdr_number": "BRB-FDR-2024-000101",
              "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
              "issue_date": "2024-01-15", "maturity_date": "2027-01-15",
              "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust"},
    )
    assert original.status_code == 200, original.text
    predecessor_id = original.json()["id"]
    _bank_confirm(predecessor_id, ao1)
    activated = _activate(predecessor_id, ao2)
    assert activated.status_code == 200 and activated.json()["state"] == "ACTIVE", activated.text
    obligation = client.get(f"/api/obligations/{obligation_id}", headers=ao2)
    assert obligation.json()["state"] == "COVERED"

    same = _renew(ar_sig, predecessor_id, number="BRB-FDR-2024-000101")
    earlier = _renew(ar_sig, predecessor_id, number="BRB-FDR-2027-000203", maturity="2027-01-15")
    assert same.status_code == earlier.status_code == 422
    assert same.json()["error"]["code"] == earlier.json()["error"]["code"] == "VALIDATION_ERROR"
    assert _renew(_login("ao1"), predecessor_id).status_code == 403
    assert _renew(_login("ta_sig"), predecessor_id).status_code == 404

    db = SessionLocal()
    try:
        predecessor = db.query(Instrument).filter(Instrument.id == predecessor_id).one()
        predecessor.is_quarantined = True
        db.commit()
    finally:
        db.close()
    quarantined = _renew(ar_sig, predecessor_id, number="BRB-FDR-2027-000203")
    assert quarantined.status_code == 409 and quarantined.json()["error"]["code"] == "INVALID_STATE"
    db = SessionLocal()
    try:
        db.query(Instrument).filter(Instrument.id == predecessor_id).one().is_quarantined = False
        db.commit()
    finally:
        db.close()

    renewed = _renew(ar_sig, predecessor_id)
    assert renewed.status_code == 200, renewed.text
    successor_id = renewed.json()["id"]
    assert renewed.json()["state"] == "SCRUTINY"
    with engine.connect() as connection:
        assert connection.execute(text(
            "SELECT supersedes_id FROM instrument WHERE id=:id"
        ), {"id": successor_id}).scalar_one() == predecessor_id
    repeated = _renew(ar_sig, predecessor_id, number="BRB-FDR-2027-000203")
    assert repeated.status_code == 409 and repeated.json()["error"]["code"] == "INVALID_STATE"
    old = client.get(f"/api/instruments/{predecessor_id}", headers=ar_sig).json()
    assert old["state"] == "ACTIVE"
    obligation = client.get(f"/api/obligations/{obligation_id}", headers=ar_sig).json()
    assert obligation["state"] == "COVERED" and obligation["covered_paise"] >= 250000000

    _bank_confirm(successor_id, ao1)
    self_approval = _activate(successor_id, ao1)
    assert self_approval.status_code == 403 and self_approval.json()["error"]["code"] == "SOD_VIOLATION"
    activated = _activate(successor_id, ao2)
    assert activated.status_code == 200 and activated.json()["state"] == "ACTIVE", activated.text
    old = client.get(f"/api/instruments/{predecessor_id}", headers=ao2).json()
    assert old["state"] == "SUPERSEDED"
    assert client.get(f"/api/obligations/{obligation_id}", headers=ao2).json()["state"] == "COVERED"
    assert _renew(ar_sig, predecessor_id, number="BRB-FDR-2027-000203").json()["error"]["code"] == "INVALID_STATE"

    # Exercise a late renewal from LAPSED and verify coverage returns after activation.
    db = SessionLocal()
    try:
        service.transition(successor_id, InstrumentState.SUPERSEDED, "test", "prepare late-renewal scenario", db)
        service.transition(predecessor_id, InstrumentState.LAPSED, "test", "late renewal scenario", db)
        service.recompute_coverage(obligation_id, db)
        db.commit()
    finally:
        db.close()
    late = _renew(ar_sig, predecessor_id, number="BRB-FDR-2027-000203", maturity="2031-01-15")
    assert late.status_code == 200, late.text
    late_id = late.json()["id"]
    _bank_confirm(late_id, ao1)
    db = SessionLocal()
    try:
        db.query(Discrepancy).filter(
            Discrepancy.instrument_id == late_id, Discrepancy.severity == "HIGH",
        ).update({"status": "CLEARED"})
        db.commit()
    finally:
        db.close()
    late_active = _activate(late_id, ao2)
    assert late_active.status_code == 200 and late_active.json()["state"] == "ACTIVE", late_active.text
    assert client.get(f"/api/instruments/{predecessor_id}", headers=ao2).json()["state"] == "SUPERSEDED"
    assert client.get(f"/api/obligations/{obligation_id}", headers=ao2).json()["state"] == "COVERED"

    predecessor_timeline = client.get(f"/api/instruments/{predecessor_id}/timeline", headers=ao2)
    successor_timeline = client.get(f"/api/instruments/{successor_id}/timeline", headers=ao2)
    assert predecessor_timeline.status_code == successor_timeline.status_code == 200
    assert predecessor_timeline.json() and successor_timeline.json()
    audit_response = client.get("/api/audit", headers=_login("admin1"))
    assert audit_response.status_code == 200, audit_response.text
    assert "renewal_started" in json.dumps(audit_response.json())
