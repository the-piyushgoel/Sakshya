"""
Tests for Intake stub router (§3.5).
"""
import io

import pytest
from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.enums import (
    DiscrepancyStatus,
    InstrumentState,
    ObligationState,
    TrustLevel,
)
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.intake.ids import stable_id
from app.modules.intake.schemas import (
    DiscrepancyListResponse,
    DiscrepancyOut,
    DocumentPreviewResponse,
    InstituteOut,
    InstrumentActionResponse,
    InstrumentDetail,
    InstrumentListResponse,
    InstrumentOut,
    ObligationListResponse,
    ObligationOut,
    TimelineEvent,
)
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_intake_db():
    create_tables()
    seed_core()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["access_token"]


def auth_header(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token(username)}"}


# ── OpenAPI existence ──────────────────────────────────────────────────────────

def test_openapi_intake_endpoints_exist():
    """Verify all 15 intake contract endpoints exist in OpenAPI schema."""
    res = client.get("/openapi.json")
    assert res.status_code == 200
    schema = res.json()
    paths = schema["paths"]

    expected_endpoints = [
        ("/api/institutes/me", "get"),
        ("/api/obligations", "get"),
        ("/api/obligations/{obligation_id}", "get"),
        ("/api/documents/preview", "post"),
        ("/api/instruments", "get"),
        ("/api/instruments", "post"),
        ("/api/instruments/{instrument_id}", "get"),
        ("/api/instruments/{instrument_id}/timeline", "get"),
        ("/api/instruments/{instrument_id}/document", "get"),
        ("/api/discrepancies", "get"),
        ("/api/discrepancies/{discrepancy_id}/resolve", "post"),
        ("/api/instruments/{instrument_id}/quarantine", "post"),
        ("/api/instruments/{instrument_id}/reject", "post"),
        ("/api/instruments/{instrument_id}/renew", "post"),
        ("/api/instruments/{instrument_id}/activate", "post"),
    ]

    for path, method in expected_endpoints:
        assert path in paths, f"Path {path} missing from OpenAPI schema"
        assert method in paths[path], f"Method {method.upper()} missing for path {path}"


# ── Unauthenticated checks (401) ──────────────────────────────────────────────

@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/institutes/me"),
        ("GET", "/api/obligations"),
        ("GET", "/api/instruments"),
        ("GET", "/api/discrepancies"),
    ],
)
def test_unauthenticated_requests_return_401(method: str, path: str):
    """Endpoints reject requests without an Authorization token with 401 UNAUTHENTICATED."""
    res = client.request(method, path)
    assert res.status_code == 401
    data = res.json()
    assert data["error"]["code"] == "UNAUTHENTICATED"


# ── Forbidden role checks (403) ────────────────────────────────────────────────

def test_forbidden_roles_return_403():
    """Endpoints reject unauthorized roles with 403 FORBIDDEN."""
    bank_headers = auth_header("brb_mk")
    res = client.get("/api/institutes/me", headers=bank_headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"

    ins_headers = auth_header("ar_sig")
    res = client.get("/api/discrepancies", headers=ins_headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


# ── Successful authorized calls with schema validation (200) ───────────────────

def test_get_my_institute():
    """Verify GET /institutes/me returns schema-valid InstituteOut."""
    headers = auth_header("ar_sig")
    res = client.get("/api/institutes/me", headers=headers)
    assert res.status_code == 200
    inst = InstituteOut.model_validate(res.json())
    assert inst.code == "ARYABHATTA"
    assert inst.name == "Aryabhatta College of Engineering"


def test_list_and_get_obligations():
    """Verify GET /obligations and GET /obligations/{id} return valid schemas."""
    headers = auth_header("ar_sig")
    res = client.get("/api/obligations", headers=headers)
    assert res.status_code == 200
    obl_list = ObligationListResponse.model_validate(res.json())
    assert obl_list.total >= 1
    assert obl_list.items[0].required_paise == 450000000

    ob_id = obl_list.items[0].id
    res_single = client.get(f"/api/obligations/{ob_id}", headers=headers)
    assert res_single.status_code == 200
    ob = ObligationOut.model_validate(res_single.json())
    assert ob.id == ob_id
    assert ob.state in (ObligationState.PENDING_DEPOSIT, ObligationState.COVERED)


def test_preview_document_genuine_and_tampered():
    """Verify POST /documents/preview returns DocumentPreviewResponse with genuine/tampered checks."""
    headers = auth_header("ar_sig")

    # Genuine PDF
    fake_genuine = io.BytesIO(b"%PDF-1.4 genuine content")
    res_gen = client.post(
        "/api/documents/preview",
        files={"file": ("fdr_genuine.pdf", fake_genuine, "application/pdf")},
        headers=headers,
    )
    assert res_gen.status_code == 200
    preview_gen = DocumentPreviewResponse.model_validate(res_gen.json())
    assert "fdr_number" in preview_gen.extracted
    assert preview_gen.flags == []

    # Tampered PDF
    fake_tampered = io.BytesIO(b"%PDF-1.4 tampered content")
    res_tamp = client.post(
        "/api/documents/preview",
        files={"file": ("fdr_tampered.pdf", fake_tampered, "application/pdf")},
        headers=headers,
    )
    assert res_tamp.status_code == 200
    preview_tamp = DocumentPreviewResponse.model_validate(res_tamp.json())
    assert "D-11" in preview_tamp.flags


def test_create_and_list_instruments():
    """Verify POST /instruments and GET /instruments lifecycle."""
    headers = auth_header("ar_sig")
    fake_pdf = io.BytesIO(b"%PDF-1.4 test instrument")

    res_post = client.post(
        "/api/instruments",
        files={"file": ("fdr_test.pdf", fake_pdf, "application/pdf")},
        data={
            "obligation_id": stable_id("obligation", "aryabhatta"),
            "fdr_number": "FDR-ARYA-401928",
            "bank_ifsc": "BRBK0001234",
            "principal_paise": 450000000,
            "issue_date": "2025-10-24",
            "maturity_date": "2027-10-24",
            "interest_rate_pct": "7.25",
        },
        headers=headers,
    )
    assert res_post.status_code == 200
    ins_created = InstrumentOut.model_validate(res_post.json())
    assert ins_created.principal_paise == 450000000
    assert ins_created.state == InstrumentState.SUBMITTED

    res_list = client.get("/api/instruments", headers=headers)
    assert res_list.status_code == 200
    ins_list = InstrumentListResponse.model_validate(res_list.json())
    assert ins_list.total >= 1


def test_get_instrument_detail_and_timeline():
    """Verify GET /instruments/{id} and timeline return full detail with trust annotations."""
    headers = auth_header("ar_sig")
    inst_id = stable_id("instrument", "aryabhatta")

    res_detail = client.get(f"/api/instruments/{inst_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = InstrumentDetail.model_validate(res_detail.json())
    assert detail.id == inst_id
    assert len(detail.fields) >= 11
    fdr_field = next(f for f in detail.fields if f.name == "fdr_number")
    assert fdr_field.value == "FDR-ARYA-401928"
    assert fdr_field.trust == TrustLevel.L0_CLAIMED

    res_time = client.get(f"/api/instruments/{inst_id}/timeline", headers=headers)
    assert res_time.status_code == 200
    timeline = [TimelineEvent.model_validate(e) for e in res_time.json()]
    assert len(timeline) >= 1


def test_get_instrument_document_stream():
    """Verify GET /instruments/{id}/document returns the sample PDF file."""
    headers = auth_header("ar_sig")
    inst_id = stable_id("instrument", "aryabhatta")
    res = client.get(f"/api/instruments/{inst_id}/document", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert b"%PDF" in res.content


def test_discrepancies_list_and_resolve():
    """Verify SO can list and resolve discrepancies."""
    so_headers = auth_header("so1")
    res_list = client.get("/api/discrepancies", headers=so_headers)
    assert res_list.status_code == 200
    disc_list = DiscrepancyListResponse.model_validate(res_list.json())
    assert disc_list.total >= 1

    disc_id = disc_list.items[0].id
    res_res = client.post(
        f"/api/discrepancies/{disc_id}/resolve",
        json={"action": "CLEAR", "note": "Verified with branch manager physically"},
        headers=so_headers,
    )
    assert res_res.status_code == 200
    resolved = DiscrepancyOut.model_validate(res_res.json())
    assert resolved.status == DiscrepancyStatus.CLEARED
    assert resolved.resolution_note == "Verified with branch manager physically"


def test_discrepancy_invalid_action_returns_validation_error():
    """Verify invalid action returns 422 VALIDATION_ERROR."""
    so_headers = auth_header("so1")
    disc_id = stable_id("discrepancy", "arya-d11")
    res = client.post(
        f"/api/discrepancies/{disc_id}/resolve",
        json={"action": "INVALID_ACTION", "note": "Not valid action"},
        headers=so_headers,
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_quarantine_reject_renew_actions():
    """Verify quarantine, reject, and renew operations."""
    ao_headers = auth_header("ao1")
    ar_headers = auth_header("ar_sig")
    inst_id = stable_id("instrument", "aryabhatta")

    # Quarantine
    res_q = client.post(f"/api/instruments/{inst_id}/quarantine", headers=ao_headers)
    assert res_q.status_code == 200
    q_data = InstrumentActionResponse.model_validate(res_q.json())
    assert q_data.is_quarantined is True

    # Reject
    res_rej = client.post(f"/api/instruments/{inst_id}/reject", headers=ao_headers)
    assert res_rej.status_code == 200
    rej_data = InstrumentActionResponse.model_validate(res_rej.json())
    assert rej_data.state == InstrumentState.REJECTED

    # Renew
    res_ren = client.post(
        f"/api/instruments/{inst_id}/renew",
        json={"new_maturity_date": "2029-10-24", "remarks": "Renewal approved"},
        headers=ar_headers,
    )
    assert res_ren.status_code == 200
    ren_data = InstrumentActionResponse.model_validate(res_ren.json())
    assert ren_data.state == InstrumentState.RENEWAL_DUE


def test_activate_step_up_guard():
    """Verify activate requires 6-digit step-up PIN verification."""
    ao_headers = auth_header("ao1")
    inst_id = stable_id("instrument", "aryabhatta")

    # Attempt to activate without step-up -> 403 STEP_UP_REQUIRED
    res_blocked = client.post(f"/api/instruments/{inst_id}/activate", headers=ao_headers)
    assert res_blocked.status_code == 403
    assert res_blocked.json()["error"]["code"] == "STEP_UP_REQUIRED"

    # Step-up with PIN 246810
    res_pin = client.post("/api/auth/step-up", json={"pin": "246810"}, headers=ao_headers)
    assert res_pin.status_code == 200

    # Activate again -> 200 OK
    res_act = client.post(f"/api/instruments/{inst_id}/activate", headers=ao_headers)
    assert res_act.status_code == 200
    act_data = InstrumentActionResponse.model_validate(res_act.json())
    assert act_data.state == InstrumentState.ACTIVE
