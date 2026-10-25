"""
Tests for Bank stub router (§3.5).
"""
import pytest
from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.enums import BankOutcome, BankRequestState
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.ids import bank_id, stable_id
from app.modules.bank.schemas import (
    BankInboxResponse,
    BankListResponse,
    BankOut,
    BankRequestDetail,
    BankRequestListResponse,
    BankRequestOut,
    ChecklistItem,
    NodalContactListResponse,
)
from fastapi.testclient import TestClient

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_bank_db():
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

def test_openapi_bank_endpoints_exist():
    """Verify all 9 bank contract endpoints exist in OpenAPI schema."""
    res = client.get("/openapi.json")
    assert res.status_code == 200
    schema = res.json()
    paths = schema["paths"]

    expected_endpoints = [
        ("/api/banks", "get"),
        ("/api/banks/{bid}/nodal-contacts", "get"),
        ("/api/bank-requests", "get"),
        ("/api/bank-requests", "post"),
        ("/api/bank-requests/{request_id}", "get"),
        ("/api/bank/inbox", "get"),
        ("/api/bank/requests/{request_id}", "get"),
        ("/api/bank/requests/{request_id}/maker-submit", "post"),
        ("/api/bank/requests/{request_id}/checker-decision", "post"),
    ]

    for path, method in expected_endpoints:
        assert path in paths, f"Path {path} missing from OpenAPI schema"
        assert method in paths[path], f"Method {method.upper()} missing for path {path}"


# ── Unauthenticated checks (401) ──────────────────────────────────────────────

@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/banks"),
        ("GET", "/api/bank-requests"),
        ("GET", "/api/bank/inbox"),
    ],
)
def test_unauthenticated_requests_return_401(method: str, path: str):
    """Endpoints reject requests without an Authorization token with 401 UNAUTHENTICATED."""
    res = client.request(method, path)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHENTICATED"


# ── Forbidden role checks (403) ────────────────────────────────────────────────

def test_forbidden_roles_return_403():
    """Endpoints reject unauthorized roles with 403 FORBIDDEN."""
    ins_headers = auth_header("ar_sig")
    res = client.get("/api/banks", headers=ins_headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"

    so_headers = auth_header("so1")
    res_inbox = client.get("/api/bank/inbox", headers=so_headers)
    assert res_inbox.status_code == 403
    assert res_inbox.json()["error"]["code"] == "FORBIDDEN"

    ck_headers = auth_header("brb_ck")
    req_id = stable_id("bank-request", "tak-brb-001")
    res_maker = client.post(
        f"/api/bank/requests/{req_id}/maker-submit",
        json={"checklist": [], "outcome": "ALL_CLEAR"},
        headers=ck_headers,
    )
    assert res_maker.status_code == 403
    assert res_maker.json()["error"]["code"] == "FORBIDDEN"

    mk_headers = auth_header("brb_mk")
    res_checker = client.post(
        f"/api/bank/requests/{req_id}/checker-decision",
        json={"decision": "AUTHORISE"},
        headers=mk_headers,
    )
    assert res_checker.status_code == 403
    assert res_checker.json()["error"]["code"] == "FORBIDDEN"


# ── Successful authorized calls with schema validation (200) ───────────────────

def test_list_banks_and_nodal_contacts():
    """Verify GET /banks and GET /banks/{id}/nodal-contacts return schema-valid bodies."""
    so_headers = auth_header("so1")
    res = client.get("/api/banks", headers=so_headers)
    assert res.status_code == 200
    banks = BankListResponse.model_validate(res.json())
    assert banks.total >= 3
    brb = next(b for b in banks.items if b.code == "BRB")
    assert isinstance(brb, BankOut)

    res_contacts = client.get(f"/api/banks/{brb.id}/nodal-contacts", headers=so_headers)
    assert res_contacts.status_code == 200
    contacts = NodalContactListResponse.model_validate(res_contacts.json())
    assert contacts.total >= 1
    assert contacts.items[0].is_directory is True


def test_create_list_and_get_bank_requests():
    """Verify AICTE officer workflow for creating, listing, and inspecting bank requests."""
    so_headers = auth_header("so1")

    # Create bank request
    res_create = client.post(
        "/api/bank-requests",
        json={
            "instrument_id": stable_id("instrument", "aryabhatta"),
            "bank_id": bank_id("BRB"),
            "remarks": "Please verify 12-point checklist",
        },
        headers=so_headers,
    )
    assert res_create.status_code == 200
    created = BankRequestOut.model_validate(res_create.json())
    assert created.state == BankRequestState.CREATED

    # List bank requests
    res_list = client.get("/api/bank-requests", headers=so_headers)
    assert res_list.status_code == 200
    req_list = BankRequestListResponse.model_validate(res_list.json())
    assert req_list.total >= 1

    # Get bank request detail
    res_detail = client.get(f"/api/bank-requests/{created.id}", headers=so_headers)
    assert res_detail.status_code == 200
    detail = BankRequestDetail.model_validate(res_detail.json())
    assert len(detail.checklist) == 12
    assert detail.directory_contact.is_directory is True
    assert detail.instrument.fdr_number != ""


def test_bank_inbox_and_request_detail():
    """Verify bank user can access inbox and view assigned request detail."""
    mk_headers = auth_header("brb_mk")
    res_inbox = client.get("/api/bank/inbox", headers=mk_headers)
    assert res_inbox.status_code == 200
    inbox = BankInboxResponse.model_validate(res_inbox.json())
    assert inbox.total >= 1

    req_id = inbox.items[0].id
    res_detail = client.get(f"/api/bank/requests/{req_id}", headers=mk_headers)
    assert res_detail.status_code == 200
    detail = BankRequestDetail.model_validate(res_detail.json())
    assert detail.id == req_id
    assert len(detail.checklist) == 12


def test_maker_submit_and_checker_decision():
    """Verify bank maker submit with 12 checklist items and checker authorisation."""
    mk_headers = auth_header("brb_mk")
    ck_headers = auth_header("brb_ck")
    req_id = stable_id("bank-request", "tak-brb-001")

    checklist = [
        ChecklistItem(item_no=i, question=f"Check item {i}", answer=True, remarks="OK")
        for i in range(1, 13)
    ]

    # Maker submit
    res_submit = client.post(
        f"/api/bank/requests/{req_id}/maker-submit",
        json={
            "checklist": [item.model_dump() for item in checklist],
            "outcome": BankOutcome.ALL_CLEAR.value,
            "remarks": "All 12 items verified in CBS",
        },
        headers=mk_headers,
    )
    assert res_submit.status_code == 200
    submitted = BankRequestOut.model_validate(res_submit.json())
    assert submitted.state == BankRequestState.MAKER_SUBMITTED
    assert submitted.outcome == BankOutcome.ALL_CLEAR

    # Checker authorise
    res_dec = client.post(
        f"/api/bank/requests/{req_id}/checker-decision",
        json={"decision": "AUTHORISE", "remarks": "Authorised by branch manager"},
        headers=ck_headers,
    )
    assert res_dec.status_code == 200
    decided = BankRequestOut.model_validate(res_dec.json())
    assert decided.state == BankRequestState.CONFIRMED


def test_checker_decision_invalid_returns_validation_error():
    """Verify checker decision with invalid action returns 422 VALIDATION_ERROR."""
    ck_headers = auth_header("brb_ck")
    req_id = stable_id("bank-request", "tak-brb-001")
    res = client.post(
        f"/api/bank/requests/{req_id}/checker-decision",
        json={"decision": "REJECT_INVALID", "remarks": "Invalid"},
        headers=ck_headers,
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
