"""
Comprehensive unit and integration tests for PR-6 Release Engine.

Covers:
- Rules E-01..E-08 + E-12 table-driven checks
- Full Golden Path (Submit -> SCRUTINY -> RELEASE_LOCKED -> RECOMMEND)
- Hold lifecycle (Place hold -> INELIGIBLE -> Lift hold -> Resubmit -> SCRUTINY)
- Rejection lifecycle and instrument lock unwinding
- Separation of Duties (SoD)
- Multi-tenant institute scoping
"""
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient

from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import (
    EligibilityVerdict,
    InstrumentState,
    ReleaseState,
    Role,
    RuleResult,
    TrustLevel,
)
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake import service as intake_service
from app.modules.intake.ids import institute_id, stable_id
from app.modules.intake.models import Discrepancy, Instrument, Obligation
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from app.modules.release import service as release_service
from app.modules.release.models import Hold, ReleaseRequest
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


# ── Golden Path: Full Vidya Jyoti Release Request Lifecycle ───────────────────

def test_golden_path_vidyajyoti_submission_to_recommend():
    """
    Vidya Jyoti (matured FDR, term complete, bank confirmed 45d ago)
    passes all eligibility rules, transitions to SCRUTINY, locks instrument,
    and is recommended by Approving Officer.
    """
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    # 1. Submit release request
    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
            "remarks": "10-year term completed successfully",
        },
    )
    assert res.status_code == 200
    data = res.json()
    req_id = data["id"]
    assert data["state"] == ReleaseState.SCRUTINY.value
    assert data["total_amount_paise"] == 450000000

    # Verify detail and rule results
    res_detail = client.get(f"/api/release/requests/{req_id}", headers=vj_headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["eligibility_verdict"] == EligibilityVerdict.ELIGIBLE.value
    assert len(detail["rules"]) >= 8

    # All rules should PASS (or WARN for non-blocking)
    for rule in detail["rules"]:
        assert rule["result"] in (RuleResult.PASS.value, RuleResult.WARN.value), f"Rule {rule['rule_id']} failed"

    # Verify instrument was locked to RELEASE_LOCKED
    ins = intake_service.get_instrument(ins_id)
    assert ins.state == InstrumentState.RELEASE_LOCKED.value

    # Verify audit trail
    assert len(detail["audit_trail"]) >= 1
    assert detail["audit_trail"][0]["action"] == "RELEASE_REQUEST_SUBMITTED"

    # 2. Approving Officer recommends request
    ao_headers = auth("ao1")
    res_rec = client.post(
        f"/api/release/requests/{req_id}/recommend",
        headers=ao_headers,
        json={"recommendation_note": "FDR maturity and bank confirmation all verified clear."},
    )
    assert res_rec.status_code == 200
    rec_data = res_rec.json()
    assert rec_data["state"] == ReleaseState.RECOMMENDED.value
    assert rec_data["recommendation_note"] == "FDR maturity and bank confirmation all verified clear."
    assert rec_data["recommender_id"] is not None


# ── Rule-by-Rule Table-Driven Tests ───────────────────────────────────────────

def test_e01_obligation_ownership():
    """E-01: Obligation must exist and belong to requesting institute."""
    vj_headers = auth("vj_sig")
    arya_ob = stable_id("obligation", "aryabhatta")
    ins_id = stable_id("instrument", "vidyajyoti")

    # Requesting another institute's obligation fails E-01
    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": arya_ob,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 403 or (res.status_code == 200 and res.json()["state"] == "INELIGIBLE")


def test_e02_signatory_authorization():
    """E-02: Only active institute signatories can submit release requests."""
    so_headers = auth("so1")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    res = client.post(
        "/api/release/requests",
        headers=so_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_e03_instrument_active_and_l2_trust():
    """E-03: Instruments must be ACTIVE or MATURED with L2 bank trust."""
    ar_headers = auth("ar_sig")
    ob_id = stable_id("obligation", "aryabhatta")
    # filler-00 has active instrument without completed L2 or different state
    ins_id = stable_id("instrument", "filler-01")

    # Modify instrument to remove L2 trust
    db = SessionLocal()
    try:
        intake_service.set_field_trust(
            instrument_id=ins_id,
            field_name="principal_paise",
            trust=TrustLevel.L0_CLAIMED.value,
            source="TEST",
            evidence_ref="claim",
            db=db,
        )
    finally:
        db.close()

    res = client.post(
        "/api/release/requests",
        headers=ar_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["state"] == ReleaseState.INELIGIBLE.value

    # Verify E-03 failed in detail
    res_det = client.get(f"/api/release/requests/{data['id']}", headers=ar_headers)
    e03 = next(r for r in res_det.json()["rules"] if r["rule_id"] == "E-03")
    assert e03["result"] == RuleResult.FAIL.value


def test_e04_release_lock_and_concurrency():
    """E-04: Cannot submit a release request on an instrument that is already locked."""
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    # 1. First request succeeds and enters SCRUTINY, locking instrument
    res1 = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res1.status_code == 200
    assert res1.json()["state"] == ReleaseState.SCRUTINY.value

    # 2. Second concurrent request on same instrument fails E-04
    res2 = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["state"] == ReleaseState.INELIGIBLE.value

    res_det = client.get(f"/api/release/requests/{data2['id']}", headers=vj_headers)
    e04 = next(r for r in res_det.json()["rules"] if r["rule_id"] == "E-04")
    assert e04["result"] == RuleResult.FAIL.value
    assert "locked" in e04["message"].lower()


def test_e05_case_type_term_completion():
    """E-05: TERM_COMPLETE requires obligation end_date <= today."""
    ta_headers = auth("ta_sig")
    ob_id = stable_id("obligation", "takshashila")  # Term ends in 2036
    ins_id = stable_id("instrument", "takshashila")

    res = client.post(
        "/api/release/requests",
        headers=ta_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["state"] == ReleaseState.INELIGIBLE.value

    res_det = client.get(f"/api/release/requests/{data['id']}", headers=ta_headers)
    e05 = next(r for r in res_det.json()["rules"] if r["rule_id"] == "E-05")
    assert e05["result"] == RuleResult.FAIL.value
    assert "future" in e05["message"].lower()


def test_e06_compliance_holds_and_quarantine():
    """E-06: Active hold on institute blocks release request."""
    na_headers = auth("na_sig")
    ob_id = stable_id("obligation", "nalanda")
    # Nalanda has a seeded active compliance hold
    res = client.post(
        "/api/release/requests",
        headers=na_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [stable_id("instrument", "filler-02")],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["state"] == ReleaseState.INELIGIBLE.value

    res_det = client.get(f"/api/release/requests/{data['id']}", headers=na_headers)
    e06 = next(r for r in res_det.json()["rules"] if r["rule_id"] == "E-06")
    assert e06["result"] == RuleResult.FAIL.value
    assert "hold" in e06["message"].lower()


def test_e07_discrepancy_clearance():
    """E-07: Open HIGH discrepancy blocks release request."""
    vj_headers = auth("vj_sig")
    ins_id = stable_id("instrument", "vidyajyoti")
    ob_id = stable_id("obligation", "vidyajyoti")

    # Add open high discrepancy
    db = SessionLocal()
    try:
        intake_service.add_discrepancy(
            instrument_id=ins_id,
            code="D-07",
            severity="HIGH",
            details={"issue": "Name variation"},
            db=db,
        )
        db.commit()
    finally:
        db.close()

    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["state"] == ReleaseState.INELIGIBLE.value

    res_det = client.get(f"/api/release/requests/{data['id']}", headers=vj_headers)
    e07 = next(r for r in res_det.json()["rules"] if r["rule_id"] == "E-07")
    assert e07["result"] == RuleResult.FAIL.value


def test_e08_bank_confirmation_freshness_triggers_manual_review():
    """E-08: Confirmation older than 90 days results in MANUAL_REVIEW."""
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    # Advance virtual clock by 60 days (45 + 60 = 105 days old > 90 threshold)
    clock.advance(60)

    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res.status_code == 200
    data = res.json()
    # MANUAL does not block from scrutiny; verdict is MANUAL_REVIEW
    assert data["state"] == ReleaseState.SCRUTINY.value

    res_det = client.get(f"/api/release/requests/{data['id']}", headers=vj_headers)
    detail = res_det.json()
    assert detail["eligibility_verdict"] == EligibilityVerdict.MANUAL_REVIEW.value
    e08 = next(r for r in detail["rules"] if r["rule_id"] == "E-08")
    assert e08["result"] == RuleResult.MANUAL.value


# ── Hold Placement, Lifting & Resubmission Lifecycle ──────────────────────────

def test_hold_placement_blocks_and_lift_resubmits():
    """
    1. Place hold on institute -> release request becomes INELIGIBLE
    2. Lift hold -> resubmit release request -> transitions to SCRUTINY & locks instrument
    """
    co_headers = auth("co1")
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")
    vj_inst_id = institute_id("vidyajyoti")

    # 1. Compliance Officer places hold
    res_hold = client.post(
        "/api/holds",
        headers=co_headers,
        json={
            "scope": "INSTITUTE",
            "entity_id": vj_inst_id,
            "reason": "Vigilance audit pending on land title",
            "legal_ref": "AICTE/VIG/2026/099",
        },
    )
    assert res_hold.status_code == 200
    hold_id = res_hold.json()["id"]

    # 2. Signatory attempts release request -> fails E-06
    res_req = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    assert res_req.status_code == 200
    req_data = res_req.json()
    req_id = req_data["id"]
    assert req_data["state"] == ReleaseState.INELIGIBLE.value

    # Instrument should NOT be locked
    ins = intake_service.get_instrument(ins_id)
    assert ins.state != InstrumentState.RELEASE_LOCKED.value

    # 3. Compliance Officer lifts hold
    res_lift = client.post(
        f"/api/holds/{hold_id}/lift",
        headers=co_headers,
        json={"reason": "Land title cleared by Standing Committee"},
    )
    assert res_lift.status_code == 200
    assert res_lift.json()["is_active"] is False

    # 4. Signatory resubmits request -> now ELIGIBLE and enters SCRUTINY
    res_resubmit = client.post(
        f"/api/release/requests/{req_id}/resubmit",
        headers=vj_headers,
    )
    assert res_resubmit.status_code == 200
    resub_data = res_resubmit.json()
    assert resub_data["state"] == ReleaseState.SCRUTINY.value
    assert resub_data["eligibility_verdict"] == EligibilityVerdict.ELIGIBLE.value

    # Instrument is now RELEASE_LOCKED
    ins = intake_service.get_instrument(ins_id)
    assert ins.state == InstrumentState.RELEASE_LOCKED.value


# ── Rejection Lifecycle & Instrument Unlock ───────────────────────────────────

def test_rejection_unlocks_instruments():
    """Rejecting a release request transitions instrument back from RELEASE_LOCKED to MATURED."""
    vj_headers = auth("vj_sig")
    ao_headers = auth("ao1")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    # 1. Submit request -> SCRUTINY & locked
    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
        },
    )
    req_id = res.json()["id"]
    assert intake_service.get_instrument(ins_id).state == InstrumentState.RELEASE_LOCKED.value

    # 2. AO rejects request
    res_rej = client.post(
        f"/api/release/requests/{req_id}/reject",
        headers=ao_headers,
        json={"reason": "Discrepancy in trust deed resolution date."},
    )
    assert res_rej.status_code == 200
    assert res_rej.json()["state"] == ReleaseState.REJECTED.value
    assert res_rej.json()["rejection_reason"] == "Discrepancy in trust deed resolution date."

    # 3. Instrument unlocked back to MATURED
    ins = intake_service.get_instrument(ins_id)
    assert ins.state == InstrumentState.MATURED.value


# ── Separation of Duties (SoD) ────────────────────────────────────────────────

def test_approving_officer_sod_enforcement():
    """Signatory cannot recommend their own release request."""
    # Create request with signatory
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={"obligation_id": ob_id, "instrument_ids": [ins_id], "case_type": "TERM_COMPLETE"},
    )
    req_id = res.json()["id"]

    # Signatory attempting to recommend gets 403 Forbidden
    res_blocked = client.post(
        f"/api/release/requests/{req_id}/recommend",
        headers=vj_headers,
        json={"recommendation_note": "Self recommending"},
    )
    assert res_blocked.status_code == 403


# ── Multi-Tenant Institute Scoping ────────────────────────────────────────────

def test_multi_tenant_institute_scoping():
    """Institute users only see requests for their own institute."""
    vj_headers = auth("vj_sig")
    ar_headers = auth("ar_sig")
    ao_headers = auth("ao1")

    # 1. Create a request for Vidya Jyoti
    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": stable_id("obligation", "vidyajyoti"),
            "instrument_ids": [stable_id("instrument", "vidyajyoti")],
            "case_type": "TERM_COMPLETE",
        },
    )
    vj_req_id = res.json()["id"]

    # 2. Aryabhatta signatory lists requests -> sees 0 items
    res_ar_list = client.get("/api/release/requests", headers=ar_headers)
    assert res_ar_list.status_code == 200
    ar_items = res_ar_list.json()["items"]
    assert not any(item["id"] == vj_req_id for item in ar_items)

    # 3. Aryabhatta signatory attempts to get Vidya Jyoti request -> 404
    res_ar_get = client.get(f"/api/release/requests/{vj_req_id}", headers=ar_headers)
    assert res_ar_get.status_code == 404

    # 4. Approving Officer sees it
    res_ao_list = client.get("/api/release/requests", headers=ao_headers)
    assert res_ao_list.status_code == 200
    ao_items = res_ao_list.json()["items"]
    assert any(item["id"] == vj_req_id for item in ao_items)
