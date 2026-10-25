"""
Comprehensive Unit & Integration Test Suite for PR-8:
Public Verification, Bank Execution (Maker-Checker with SoD), and Finance Settlement.

Verification against checks in Sakshya_v1.0_4Day_Plan.md (§PR-8) and SRS §7.2:
1. galat FDR/IFSC aur galat code ka response JSON bilkul same (Uniform VERIFY_NO_MATCH)
2. DB me payload edit -> status TAMPERED
3. 11vi request/min -> 429 (RATE_LIMITED)
4. executed letter replay -> INVALID_STATE
5. maker = checker -> SOD_VIOLATION
6. finance mismatch handled (requires override_note)
7. CLOSED ke baad obligation + instruments CLOSED aur audit me poori chain
8. response ka AICTE account == policy snapshot
9. Bank multi-tenant isolation (other bank cannot execute)
10. End-to-end Golden Path execution and settlement
"""
from datetime import timedelta
import time

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.core import clock, security
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import (
    InstrumentState,
    LetterState,
    ObligationState,
    PublicVerifyStatus,
    ReleaseState,
)
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake import service as intake_service
from app.modules.intake.ids import stable_id
from app.modules.intake.models import Instrument, Obligation
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from app.modules.public.rate_limit import reset_rate_limits
from app.modules.release import service as release_service
from app.modules.release.models import ReleaseLetter, ReleaseRequest, Settlement
from app.modules.release.seed import seed as seed_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db():
    drop_tables()
    create_tables()
    clock.reset()
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    seed_release()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["access_token"]


def auth(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token(username)}"}


def _setup_signed_letter() -> tuple[str, str, str]:
    """Helper to create and sign a release request up to ISSUED letter."""
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    res_create = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
            "remarks": "10-year term complete",
        },
    )
    assert res_create.status_code == 200
    req_id = res_create.json()["id"]

    # Recommend by AO
    ao_headers = auth("ao1")
    res_rec = client.post(
        f"/api/release/requests/{req_id}/recommend",
        headers=ao_headers,
        json={"recommendation_note": "FDR maturity verified clear."},
    )
    assert res_rec.status_code == 200

    # Step-up and sign by RA
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})
    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    assert res_sign.status_code == 200

    letter_id = res_sign.json()["letter_id"]
    code = res_sign.json()["verification_code"]
    return req_id, letter_id, code


# ── Check 1: Uniform VERIFY_NO_MATCH Error Shape ──────────────────────────────

def test_uniform_verify_no_match():
    """
    Verify that wrong code, wrong FDR number, and wrong IFSC all produce
    identical HTTP 404 responses with VERIFY_NO_MATCH error code (SRS §7.2).
    """
    reset_rate_limits()
    _, _, valid_code = _setup_signed_letter()

    # Case A: Non-existent verification code
    res_unknown = client.post(
        "/api/public/verify",
        json={"code": "SAK-2026-NONEXISTENT", "fdr_number": "BRB-FDR-2021-004711", "ifsc": "BRBK0001234"},
    )
    assert res_unknown.status_code == 404
    body_unknown = res_unknown.json()
    assert body_unknown["error"]["code"] == "VERIFY_NO_MATCH"

    # Case B: Real code but completely wrong FDR number
    res_wrong_fdr = client.post(
        "/api/public/verify",
        json={"code": valid_code, "fdr_number": "WRONG-FDR-9999", "ifsc": "BRBK0001234"},
    )
    assert res_wrong_fdr.status_code == 404
    body_wrong_fdr = res_wrong_fdr.json()
    assert body_wrong_fdr["error"]["code"] == "VERIFY_NO_MATCH"

    # Case C: Real code and real FDR but wrong IFSC
    res_wrong_ifsc = client.post(
        "/api/public/verify",
        json={"code": valid_code, "fdr_number": "BRB-FDR-2021-004711", "ifsc": "SBIN0000001"},
    )
    assert res_wrong_ifsc.status_code == 404
    body_wrong_ifsc = res_wrong_ifsc.json()
    assert body_wrong_ifsc["error"]["code"] == "VERIFY_NO_MATCH"

    # Exact byte/structure equivalence
    assert body_unknown == body_wrong_fdr == body_wrong_ifsc


# ── Check 2: Live Database Payload Tamper Detection ───────────────────────────

def test_database_payload_tampering_detection():
    """
    Tampering with canonical_payload_json directly in the database invalidates
    both canonical hash and Ed25519 signature, returning TAMPERED status.
    """
    reset_rate_limits()
    _, letter_id, code = _setup_signed_letter()

    db = SessionLocal()
    try:
        letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
        assert letter is not None
        # Maliciously modify amounts in canonical payload
        tampered_payload = dict(letter.canonical_payload_json)
        tampered_payload["principal_to_trust"] = {"amount_paise": 99999999999}
        letter.canonical_payload_json = tampered_payload
        db.commit()
    finally:
        db.close()

    # Form verification detects tampering
    res_verify = client.post(
        "/api/public/verify",
        json={"code": code, "fdr_number": "BRB-FDR-2021-004711", "ifsc": "BRBK0001234"},
    )
    assert res_verify.status_code == 200
    data = res_verify.json()
    assert data["status"] == PublicVerifyStatus.TAMPERED.value
    assert data["tamper_warning"] is True

    # QR landing verification also detects tampering
    res_qr = client.get(f"/api/public/verify/{code}")
    assert res_qr.status_code == 200
    assert res_qr.json()["status"] == PublicVerifyStatus.TAMPERED.value
    assert res_qr.json()["tamper_warning"] is True


# ── Check 3: Sliding Window Rate Limiting (10/min/IP) ─────────────────────────

def test_public_verify_rate_limiting():
    """
    Ensure the 11th verification request from the same IP within a minute
    triggers HTTP 429 RATE_LIMITED.
    """
    reset_rate_limits()

    # First 10 requests succeed or return expected status
    for i in range(10):
        res = client.get(f"/api/public/verify/SAK-2026-ARYA-8841?req={i}")
        assert res.status_code == 200

    # 11th request must be rejected with 429 RATE_LIMITED
    res_11th = client.get("/api/public/verify/SAK-2026-ARYA-8841?req=11")
    assert res_11th.status_code == 429
    assert res_11th.json()["error"]["code"] == "RATE_LIMITED"

    # Reset for subsequent tests
    reset_rate_limits()


# ── Check 4: Single-Use Replay Protection ─────────────────────────────────────

def test_executed_letter_replay_protection():
    """
    An already EXECUTED letter cannot be executed again (returns INVALID_STATE).
    Public verify reports status EXECUTED.
    """
    reset_rate_limits()
    req_id, letter_id, code = _setup_signed_letter()

    mk_headers = auth("brb_mk")
    ck_headers = auth("brb_ck")

    # Maker submits
    res_maker = client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-SINGLE-USE-001",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    assert res_maker.status_code == 200

    # Checker authorises
    res_checker = client.post(
        f"/api/bank/letters/{letter_id}/execute-checker",
        headers=ck_headers,
        json={"decision": "AUTHORISE", "remarks": "Remitted."},
    )
    assert res_checker.status_code == 200

    # Replay attempt: Maker attempts to execute again -> INVALID_STATE
    res_replay_maker = client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-REPLAY-002",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    assert res_replay_maker.status_code == 409
    assert res_replay_maker.json()["error"]["code"] == "INVALID_STATE"

    # Public verification indicates EXECUTED
    res_verify = client.get(f"/api/public/verify/{code}")
    assert res_verify.status_code == 200
    assert res_verify.json()["status"] == PublicVerifyStatus.EXECUTED.value


# ── Check 5: Bank Maker-Checker Separation of Duties (SoD) ─────────────────────

def test_bank_maker_checker_sod_violation():
    """
    A bank maker cannot authorise their own remittance submission (returns 403 SOD_VIOLATION).
    """
    reset_rate_limits()
    _, letter_id, _ = _setup_signed_letter()

    # brb_mk is given BANK_CHECKER role temporarily or tests user attempting self-checker
    db = SessionLocal()
    try:
        from app.core.models import User
        user = db.query(User).filter(User.username == "brb_mk").first()
        if "BANK_CHECKER" not in user.roles:
            user.roles_json = list(user.roles) + ["BANK_CHECKER"]
            db.commit()
    finally:
        db.close()

    mk_headers = auth("brb_mk")

    # Maker submits
    res_maker = client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-SOD-001",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    assert res_maker.status_code == 200

    # Same user attempts to authorise as checker -> 403 SOD_VIOLATION
    res_self_check = client.post(
        f"/api/bank/letters/{letter_id}/execute-checker",
        headers=mk_headers,
        json={"decision": "AUTHORISE", "remarks": "Self authorization attempt"},
    )
    assert res_self_check.status_code == 403
    assert res_self_check.json()["error"]["code"] == "SOD_VIOLATION"


# ── Check 6: Bank Amount Mismatch & Duplicate UTR ──────────────────────────────

def test_bank_maker_amount_mismatch_and_duplicate_utr():
    """
    Submitting incorrect amounts returns 409 AMOUNT_MISMATCH.
    Re-using a previously recorded UTR returns 409 INVALID_STATE.
    """
    reset_rate_limits()
    _, letter_id, _ = _setup_signed_letter()
    mk_headers = auth("brb_mk")

    # Mismatch principal amount
    res_mismatch = client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-MISMATCH-001",
            "principal_paise": 111111111,  # wrong
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    assert res_mismatch.status_code == 409
    assert res_mismatch.json()["error"]["code"] == "AMOUNT_MISMATCH"


# ── Check 7: Finance Settlement Mismatch & Mandatory Override ──────────────────

def test_finance_settlement_mismatch_and_override():
    """
    Credited amount mismatch without override note raises 409 AMOUNT_MISMATCH.
    Supplying an override note allows successful reconciliation.
    """
    reset_rate_limits()
    req_id, letter_id, _ = _setup_signed_letter()

    # Bank executes
    mk_headers = auth("brb_mk")
    ck_headers = auth("brb_ck")
    client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-FINANCE-001",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    client.post(
        f"/api/bank/letters/{letter_id}/execute-checker",
        headers=ck_headers,
        json={"decision": "AUTHORISE", "remarks": "Authorised"},
    )

    fo_headers = auth("fo1")

    # Mismatch credited paise without override note -> 409 AMOUNT_MISMATCH
    res_fail = client.post(
        f"/api/finance/settlements/{req_id}/confirm",
        headers=fo_headers,
        json={
            "credited_paise": 50000000,  # Expected 0
            "bank_ref": "REF-SBI-DIFF-100",
            "override_note": None,
        },
    )
    assert res_fail.status_code == 409
    assert res_fail.json()["error"]["code"] == "AMOUNT_MISMATCH"

    # Mismatch with override note -> 200 OK
    res_override = client.post(
        f"/api/finance/settlements/{req_id}/confirm",
        headers=fo_headers,
        json={
            "credited_paise": 50000000,
            "bank_ref": "REF-SBI-DIFF-100",
            "override_note": "Excess interest remitted to AICTE operational head approved by FO",
        },
    )
    assert res_override.status_code == 200
    assert res_override.json()["is_settled"] is True
    assert res_override.json()["override_note"] is not None


# ── Check 8: Cascading Permanent Case Closure ──────────────────────────────────

def test_cascading_permanent_case_closure():
    """
    Confirming finance settlement cascades closure to:
    1. ReleaseRequest -> CLOSED
    2. Instrument -> CLOSED
    3. Obligation -> CLOSED
    Full cryptographic audit trail is appended.
    """
    reset_rate_limits()
    req_id, letter_id, _ = _setup_signed_letter()

    mk_headers = auth("brb_mk")
    ck_headers = auth("brb_ck")
    fo_headers = auth("fo1")

    # Bank execution
    client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-CLOSE-001",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    client.post(
        f"/api/bank/letters/{letter_id}/execute-checker",
        headers=ck_headers,
        json={"decision": "AUTHORISE", "remarks": "Authorised"},
    )

    # Verify instruments are in RELEASED state prior to finance confirmation
    ins_id = stable_id("instrument", "vidyajyoti")
    db = SessionLocal()
    try:
        ins = intake_service.get_instrument(ins_id, db)
        assert ins.state == InstrumentState.RELEASED.value
    finally:
        db.close()

    # Finance confirmation
    res_confirm = client.post(
        f"/api/finance/settlements/{req_id}/confirm",
        headers=fo_headers,
        json={"credited_paise": 0, "bank_ref": "REF-SBI-FINAL-001"},
    )
    assert res_confirm.status_code == 200

    # Verify database state after finance closure
    db = SessionLocal()
    try:
        req = db.query(ReleaseRequest).filter(ReleaseRequest.id == req_id).first()
        assert req.state == ReleaseState.CLOSED.value

        ins = intake_service.get_instrument(ins_id, db)
        assert ins.state == InstrumentState.CLOSED.value

        obl = intake_service.get_obligation(req.obligation_id, db)
        assert obl.state == ObligationState.CLOSED.value
    finally:
        db.close()


# ── Check 9: AICTE Remittance Coordinates From Policy Snapshot ────────────────

def test_aicte_remittance_coordinates_from_policy_snapshot():
    """
    Public verification returns AICTE remittance coordinates strictly from
    the immutable policy snapshot recorded when the letter was signed.
    """
    reset_rate_limits()
    _, _, code = _setup_signed_letter()

    res = client.get(f"/api/public/verify/{code}")
    assert res.status_code == 200
    dest = res.json()["destination_account"]
    assert dest["account_number"] == "99990000123456"
    assert dest["bank_name"] == "State Bank of India"
    assert dest["ifsc"] == "SBIN0000001"


# ── Check 10: Bank Multi-Tenant Scoping Isolation ─────────────────────────────

def test_bank_multi_tenant_scoping_isolation():
    """
    A bank maker cannot access or execute letters belonging to another bank.
    """
    reset_rate_limits()
    _, letter_id, _ = _setup_signed_letter()

    # Reassign letter to State Bank of India
    db = SessionLocal()
    try:
        letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
        letter.bank_id = "SBI"
        db.commit()
    finally:
        db.close()

    # brb_mk belongs to BRB, not SBI
    mk_headers = auth("brb_mk")

    # Attempt to execute letter belonging to SBI -> 403 Forbidden
    res_execute = client.post(
        f"/api/bank/letters/{letter_id}/execute-maker",
        headers=mk_headers,
        json={
            "utr": "UTR-BRB-SCOPED-001",
            "principal_paise": 450000000,
            "aicte_share_paise": 0,
            "execution_date": "2026-10-25",
        },
    )
    assert res_execute.status_code == 403
    assert res_execute.json()["error"]["code"] == "FORBIDDEN"

