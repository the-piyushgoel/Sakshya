"""
Unit and integration tests for Release stub router (§3.5).
"""
from fastapi.testclient import TestClient
import pytest

from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.enums import LetterState, ReleaseState
from app.core.seed import seed as seed_core
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_release_db():
    create_tables()
    seed_core()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200
    return res.json()["access_token"]


def test_list_and_get_release_requests():
    """Verify listing and viewing detail of release requests."""
    ao_token = get_token("ao1")
    headers = {"Authorization": f"Bearer {ao_token}"}

    res = client.get("/api/release/requests", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 1

    req_id = data["items"][0]["id"]
    res_detail = client.get(f"/api/release/requests/{req_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == req_id
    assert len(detail["rules"]) == 8  # E-01 through E-08


def test_create_and_recommend_release_request():
    """Verify submission and AO recommendation lifecycle."""
    ar_token = get_token("ar_sig")
    ar_headers = {"Authorization": f"Bearer {ar_token}"}

    # 1. Institute submits release request
    res_create = client.post(
        "/api/release/requests",
        json={
            "obligation_id": "ob-aryabhatta-ug",
            "instrument_ids": ["inst-aryabhatta-fdr1"],
            "case_type": "TERM_COMPLETE",
        },
        headers=ar_headers,
    )
    assert res_create.status_code == 200
    req_data = res_create.json()
    assert req_data["state"] == ReleaseState.SUBMITTED.value

    # 2. AO recommends release request
    ao_token = get_token("ao1")
    ao_headers = {"Authorization": f"Bearer {ao_token}"}
    res_rec = client.post(
        f"/api/release/requests/{req_data['id']}/recommend",
        json={"recommendation_note": "Term complete verified."},
        headers=ao_headers,
    )
    assert res_rec.status_code == 200
    assert res_rec.json()["state"] == ReleaseState.RECOMMENDED.value


def test_sign_release_request_step_up_lifecycle():
    """Verify RA signature requires 6-digit step-up PIN verification."""
    ra_token = get_token("ra1")
    ra_headers = {"Authorization": f"Bearer {ra_token}"}

    # Attempt to sign without step-up -> 403 STEP_UP_REQUIRED
    res_blocked = client.post(
        "/api/release/requests/rel-req-1/sign",
        headers=ra_headers,
    )
    assert res_blocked.status_code == 403
    assert res_blocked.json()["error"]["code"] == "STEP_UP_REQUIRED"

    # Step-up with PIN 246810
    res_step = client.post(
        "/api/auth/step-up",
        json={"pin": "246810"},
        headers=ra_headers,
    )
    assert res_step.status_code == 200

    # Sign again -> 200 OK with letter details
    res_signed = client.post(
        "/api/release/requests/rel-req-1/sign",
        headers=ra_headers,
    )
    assert res_signed.status_code == 200
    sign_data = res_signed.json()
    assert sign_data["status"] == "SIGNED"
    assert "letter_id" in sign_data
    assert "pdf_url" in sign_data


def test_release_letter_metadata_and_pdf():
    """Verify release letter view and PDF streaming endpoint."""
    ra_token = get_token("ra1")
    headers = {"Authorization": f"Bearer {ra_token}"}

    res_meta = client.get("/api/release/letters/letter-arya-term-2026", headers=headers)
    assert res_meta.status_code == 200
    assert res_meta.json()["state"] == LetterState.ISSUED.value

    res_pdf = client.get("/api/release/letters/letter-arya-term-2026/pdf", headers=headers)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert b"%PDF" in res_pdf.content


def test_compliance_holds_management():
    """Verify Compliance Officer can list, create, and lift holds."""
    co_token = get_token("co1")
    headers = {"Authorization": f"Bearer {co_token}"}

    # List holds
    res_list = client.get("/api/holds", headers=headers)
    assert res_list.status_code == 200
    assert res_list.json()["total"] >= 1

    # Place hold
    res_create = client.post(
        "/api/holds",
        json={
            "scope": "INSTITUTE",
            "entity_id": "inst-test-target",
            "reason": "Test audit inquiry",
            "legal_ref": "AICTE/AUDIT/2026",
        },
        headers=headers,
    )
    assert res_create.status_code == 200
    hold_id = res_create.json()["id"]

    # Lift hold
    res_lift = client.post(
        f"/api/holds/{hold_id}/lift",
        json={"reason": "Audit inquiry resolved successfully"},
        headers=headers,
    )
    assert res_lift.status_code == 200
    assert res_lift.json()["is_active"] is False


def test_bank_execution_maker_checker():
    """Verify Bank Maker/Checker execution endpoints."""
    mk_token = get_token("brb_mk")
    ck_token = get_token("brb_ck")

    # Maker lists letters
    res_letters = client.get("/api/bank/letters", headers={"Authorization": f"Bearer {mk_token}"})
    assert res_letters.status_code == 200

    # Maker executes
    res_maker = client.post(
        "/api/bank/letters/letter-arya-term-2026/execute-maker",
        json={
            "utr": "UTR-BRB-12345678",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-05-18",
        },
        headers={"Authorization": f"Bearer {mk_token}"},
    )
    assert res_maker.status_code == 200
    assert res_maker.json()["status"] == "MAKER_EXECUTED"

    # Checker confirms
    res_checker = client.post(
        "/api/bank/letters/letter-arya-term-2026/execute-checker",
        json={"decision": "AUTHORISE", "remarks": "Remittance verified."},
        headers={"Authorization": f"Bearer {ck_token}"},
    )
    assert res_checker.status_code == 200
    assert res_checker.json()["status"] == "CHECKER_CONFIRMED"


def test_finance_settlement_reconciliation():
    """Verify Finance Officer can view and confirm credit settlements."""
    fo_token = get_token("fo1")
    headers = {"Authorization": f"Bearer {fo_token}"}

    # List settlements
    res_list = client.get("/api/finance/settlements", headers=headers)
    assert res_list.status_code == 200
    data = res_list.json()
    assert data["total"] >= 1

    # Confirm settlement
    release_id = data["items"][0]["release_request_id"]
    res_confirm = client.post(
        f"/api/finance/settlements/{release_id}/confirm",
        json={"credited_paise": 0, "bank_ref": "REF-SBI-99182374"},
        headers=headers,
    )
    assert res_confirm.status_code == 200
    assert res_confirm.json()["is_settled"] is True

