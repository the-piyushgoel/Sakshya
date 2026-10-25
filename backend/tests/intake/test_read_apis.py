import hashlib
from pathlib import Path

import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.ids import stable_id
from app.modules.intake.models import Document
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from fastapi.testclient import TestClient

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
TAKSHASHILA_INSTRUMENT_ID = stable_id("instrument", "takshashila")
ARYABHATTA_OBLIGATION_ID = stable_id("obligation", "aryabhatta")


@pytest.fixture(scope="module", autouse=True)
def full_seed():
    create_tables()
    # Mirrors scripts/seed_all.py; release and insights are absent and skipped there.
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    response = client.post(
        "/api/auth/login", json={"username": "ar_sig", "password": "demo@123"},
    )
    assert response.status_code == 200
    response = client.post(
        "/api/instruments",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        files={"file": (SAMPLE.name, SAMPLE.read_bytes(), "application/pdf")},
        data={
            "obligation_id": ARYABHATTA_OBLIGATION_ID,
            "fdr_number": "READ-API-ARYA-0001", "bank_ifsc": "BRBK0001234",
            "principal_paise": "250000000", "issue_date": "2024-01-15",
            "maturity_date": "2027-01-15", "interest_rate_pct": "7.25",
            "holder_names": "Aryabhatta Trust",
        },
    )
    assert response.status_code == 200, response.text
    yield
    drop_tables()
    clock.reset()


def auth(username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_institute_and_obligations_are_scoped_and_include_real_values():
    headers = auth("ar_sig")
    institute = client.get("/api/institutes/me", headers=headers)
    assert institute.status_code == 200
    assert institute.json()["code"] == "ARYABHATTA"

    obligations = client.get("/api/obligations", headers=headers).json()
    assert obligations["total"] == len(obligations["items"]) == 1
    assert obligations["items"][0]["institute_id"] == stable_id("institute", "aryabhatta")
    detail = client.get(f"/api/obligations/{ARYABHATTA_OBLIGATION_ID}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["institute_name"].startswith("Aryabhatta")
    assert {"required_paise", "covered_paise", "state", "instruments_count"} <= detail.json().keys()


def test_instrument_scope_officers_filters_and_pagination():
    ar_headers = auth("ar_sig")
    own = client.get("/api/instruments", headers=ar_headers, params={"page_size": 100})
    assert own.status_code == 200
    assert own.json()["total"] == len(own.json()["items"]) == 1
    assert all(item["institute_id"] == stable_id("institute", "aryabhatta") for item in own.json()["items"])
    assert client.get(f"/api/instruments/{TAKSHASHILA_INSTRUMENT_ID}", headers=ar_headers).status_code == 404

    officer = client.get("/api/instruments", headers=auth("so1"), params={"page": 1, "page_size": 2})
    assert officer.status_code == 200
    assert officer.json()["total"] == 20
    assert len(officer.json()["items"]) == 2
    filtered = client.get("/api/instruments", headers=auth("so1"), params={
        "obligation_id": ARYABHATTA_OBLIGATION_ID, "page_size": 100,
    })
    assert filtered.json()["total"] == len(filtered.json()["items"]) == 1


def test_timeline_document_hash_and_unknown_ids():
    headers = auth("ar_sig")
    listing = client.get("/api/instruments", headers=headers).json()
    submitted_id = listing["items"][0]["id"]
    timeline = client.get(f"/api/instruments/{submitted_id}/timeline", headers=headers)
    assert timeline.status_code == 200
    times = [event["at"] for event in timeline.json()]
    assert times == sorted(times)

    db = SessionLocal()
    try:
        document = db.query(Document).filter(Document.instrument_id == submitted_id).one()
        expected_hash = document.sha256
    finally:
        db.close()
    download = client.get(f"/api/instruments/{submitted_id}/document", headers=headers)
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert hashlib.sha256(download.content).hexdigest() == expected_hash

    assert client.get("/api/instruments/unknown", headers=headers).status_code == 404
    assert client.get("/api/instruments/unknown/timeline", headers=headers).status_code == 404
    assert client.get("/api/instruments/unknown/document", headers=headers).status_code == 404
    assert client.get("/api/instruments").status_code == 401
