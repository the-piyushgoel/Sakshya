import hashlib
from pathlib import Path

import pytest
from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import InstrumentState, Severity, TrustLevel
from app.core.models import AuditEvent
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.ids import stable_id
from app.modules.intake.models import Document, InstrumentStateHistory
from app.modules.intake.seed import seed as seed_intake
from fastapi.testclient import TestClient

client = TestClient(app)
SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "out"


@pytest.fixture(autouse=True)
def seeded_db():
    create_tables()
    seed_core()
    seed_intake()
    seed_bank()
    yield
    drop_tables()
    clock.reset()


def auth(username: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def submit(username: str, sample: str, obligation: str | None = None):
    path = SAMPLES / sample
    duplicate_case = sample == "fdr_duplicate_vidyajyoti.pdf"
    return client.post(
        "/api/instruments",
        headers=auth(username),
        files={"file": (path.name, path.read_bytes(), "application/pdf")},
        data={
            "obligation_id": obligation or stable_id("obligation", "aryabhatta" if username == "ar_sig" else "nalanda"),
            "fdr_number": "BRB-FDR-2021-004711" if duplicate_case else "BRB-FDR-2024-000101",
            "bank_ifsc": "BRBK0001234",
            "principal_paise": "250000000", "issue_date": "2024-01-15",
            "maturity_date": "2027-01-15", "interest_rate_pct": "7.25",
            "holder_names": "Aryabhatta Trust; Aryabhatta Education Society",
        },
    )


def test_genuine_submission_persists_fields_file_and_transitions():
    response = submit("ar_sig", "fdr_genuine_aryabhatta.pdf")
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["state"] == InstrumentState.SCRUTINY.value
    assert len(detail["fields"]) >= 7
    assert all(field["trust"] == TrustLevel.L0_CLAIMED.value for field in detail["fields"])
    assert not any(d["severity"] == Severity.HIGH.value for d in detail["discrepancies"]), detail["discrepancies"]
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.instrument_id == detail["id"]).one()
        assert doc.sha256 == hashlib.sha256((SAMPLES / "fdr_genuine_aryabhatta.pdf").read_bytes()).hexdigest()
        history = db.query(InstrumentStateHistory).filter_by(instrument_id=detail["id"]).all()
        assert [row.to_state for row in history] == ["AUTO_CHECKING", "SCRUTINY"]
        assert db.query(AuditEvent).filter(AuditEvent.entity_id == detail["id"], AuditEvent.action.in_(
            ["INSTRUMENT_AUTO_CHECKING", "INSTRUMENT_SCRUTINY"])).count() == 2
    finally:
        db.close()


def test_tampered_amount_is_high_d11():
    response = submit("ar_sig", "fdr_tampered_amount.pdf")
    assert response.status_code == 200, response.text
    assert any(d["code"] == "D-11" and d["severity"] == "HIGH" for d in response.json()["discrepancies"])


def test_duplicate_is_high_and_does_not_disclose_other_institute():
    response = submit("na_sig", "fdr_duplicate_vidyajyoti.pdf")
    assert response.status_code == 200, response.text
    assert response.json()["state"] == InstrumentState.SCRUTINY.value
    assert any(d["code"] == "D-05" and d["severity"] == "HIGH" for d in response.json()["discrepancies"])
    assert "Vidya Jyoti" not in response.text


def test_obligation_scope_and_signatory_role():
    other = submit("ar_sig", "fdr_genuine_aryabhatta.pdf", stable_id("obligation", "nalanda"))
    assert other.status_code == 404
    path = SAMPLES / "fdr_genuine_aryabhatta.pdf"
    officer = client.post("/api/instruments", headers=auth("so1"), files={
        "file": (path.name, path.read_bytes(), "application/pdf")
    }, data={"obligation_id": stable_id("obligation", "aryabhatta"), "fdr_number": "x",
             "bank_ifsc": "BRBK0001234", "principal_paise": 1, "issue_date": "2024-01-15",
             "maturity_date": "2027-01-15"})
    assert officer.status_code == 403
