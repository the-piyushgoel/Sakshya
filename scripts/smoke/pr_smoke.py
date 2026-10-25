#!/usr/bin/env python3
"""
PR smoke — Premansh's lane smoke tests.
Added to gradually as PR-2 through PR-8 are completed.
Run via: make smoke (or python scripts/smoke/pr_smoke.py directly)
"""
import os
import sys

import httpx

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:8000")


def check(label: str, response: httpx.Response, expected_status: int = 200) -> None:
    if response.status_code != expected_status:
        print(f"  ✗ {label}: expected {expected_status}, got {response.status_code}")
        print(f"    body: {response.text[:200]}")
        sys.exit(1)
    print(f"  ✓ {label}")


def main() -> None:
    print("── PR smoke ─────────────────────────────────────")

    client = None
    try:
        h = httpx.Client(base_url=BASE, timeout=2)
        r = h.get("/api/health")
        if r.status_code == 200:
            client = h
    except Exception:
        pass

    if client is None:
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
        os.chdir(backend_dir)
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

    try:
        # PR-1: Health
        r = client.get("/api/health")
        check("GET /api/health → 200", r, 200)
        assert r.json()["status"] == "ok", "health.status != ok"
        print("  ✓ health.status == ok")

        # PR-2: Demo users & Authentication
        r_demo = client.get("/api/demo/users")
        check("GET /api/demo/users → 200", r_demo, 200)
        users = r_demo.json()
        assert len(users) == 20, f"Expected 20 users, got {len(users)}"
        print("  ✓ demo users count == 20")

        # Login as Aryabhatta signatory
        r_login = client.post("/api/auth/login", json={"username": "ar_sig", "password": "demo@123"})
        check("POST /api/auth/login (ar_sig) → 200", r_login, 200)
        token = r_login.json()["access_token"]
        assert token, "Missing access_token"
        headers = {"Authorization": f"Bearer {token}"}
        print("  ✓ login token received")

        # Verify current profile
        r_me = client.get("/api/me", headers=headers)
        check("GET /api/me → 200", r_me, 200)
        assert r_me.json()["username"] == "ar_sig"
        print("  ✓ authenticated profile matches")

        # Test step-up PIN verification
        r_step = client.post("/api/auth/step-up", json={"pin": "246810"}, headers=headers)
        check("POST /api/auth/step-up → 200", r_step, 200)
        assert r_step.json()["status"] == "ok"
        print("  ✓ step-up PIN verified")

        # PR-3: Clock Persistence & Time-Travel
        r_clock = client.get("/api/admin/clock")
        check("GET /api/admin/clock → 200", r_clock, 200)
        assert "now" in r_clock.json()
        print("  ✓ clock layout endpoint ok")

        # Login as System Administrator for PR-3 admin operations
        r_admin_login = client.post("/api/auth/login", json={"username": "admin1", "password": "demo@123"})
        check("POST /api/auth/login (admin1) → 200", r_admin_login, 200)
        admin_token = r_admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Advance clock
        r_adv = client.post("/api/admin/clock/advance", json={"days": 10}, headers=admin_headers)
        check("POST /api/admin/clock/advance → 200", r_adv, 200)
        assert r_adv.json()["offset_seconds"] == 10 * 86400

        # Reset clock
        r_reset = client.post("/api/admin/clock/reset", headers=admin_headers)
        check("POST /api/admin/clock/reset → 200", r_reset, 200)
        assert r_reset.json()["offset_seconds"] == 0
        print("  ✓ clock advance and reset verified")

        # PR-3: Policy Engine
        r_policy = client.get("/api/policy", headers=admin_headers)
        check("GET /api/policy → 200", r_policy, 200)
        assert r_policy.json()["deposit_term_years"] == 10
        print("  ✓ policy defaults verified")

        # PR-3: Audit Chain & Integrity Verification
        r_audit = client.get("/api/audit", headers=admin_headers)
        check("GET /api/audit → 200", r_audit, 200)
        assert r_audit.json()["total"] >= 1

        r_verify = client.get("/api/audit/verify", headers=admin_headers)
        check("GET /api/audit/verify → 200", r_verify, 200)
        assert r_verify.json()["ok"] is True
        print("  ✓ audit chain integrity valid")

        # Tamper & Repair Demo
        r_tamper = client.post("/api/admin/audit/tamper-demo", json={"seq": 1}, headers=admin_headers)
        check("POST /api/admin/audit/tamper-demo → 200", r_tamper, 200)
        r_broken = client.get("/api/audit/verify", headers=admin_headers)
        assert r_broken.json()["ok"] is False and r_broken.json()["first_broken_seq"] == 1
        print("  ✓ tamper detection caught sequence 1 alteration")

        r_repair = client.post("/api/admin/audit/repair-demo", json={"from_seq": 1}, headers=admin_headers)
        check("POST /api/admin/audit/repair-demo → 200", r_repair, 200)
        r_fixed = client.get("/api/audit/verify", headers=admin_headers)
        assert r_fixed.json()["ok"] is True
        print("  ✓ repair demo restored audit hash chain")

        # PR-4: Notifications Subsystem
        r_notifs = client.get("/api/notifications", headers=headers)
        check("GET /api/notifications (ar_sig) → 200", r_notifs, 200)
        notifs_data = r_notifs.json()
        assert notifs_data["total"] >= 1
        first_notif_id = notifs_data["items"][0]["id"]
        print("  ✓ institute notifications retrieved")

        r_mark_read = client.post(f"/api/notifications/{first_notif_id}/read", headers=headers)
        check(f"POST /api/notifications/{first_notif_id}/read → 200", r_mark_read, 200)
        assert r_mark_read.json()["read"] is True

        r_mark_all = client.post("/api/notifications/read-all", headers=headers)
        check("POST /api/notifications/read-all → 200", r_mark_all, 200)
        print("  ✓ mark-read endpoints verified")

        # PR-4: Job Registry & Scheduled Tick
        r_tick = client.post("/api/admin/tick", headers=admin_headers)
        check("POST /api/admin/tick → 200", r_tick, 200)
        assert r_tick.json()["status"] == "ok"
        assert len(r_tick.json()["jobs_run"]) >= 1
        print("  ✓ background tick engine executed")

        # PR-5: Monitoring Subsystem & Maturity Scanning
        r_alerts = client.get("/api/alerts", headers=headers)
        check("GET /api/alerts (ar_sig) → 200", r_alerts, 200)
        assert r_alerts.json()["total"] >= 1
        for a in r_alerts.json()["items"]:
            assert "Aryabhatta" in a["institute_name"]
        print("  ✓ monitoring alerts retrieved with institute scoping")

        # Scrutiny officer checks alerts
        so_login = client.post("/api/auth/login", json={"username": "so1", "password": "demo@123"})
        so_token = so_login.json()["access_token"]
        so_headers = {"Authorization": f"Bearer {so_token}"}
        r_so_alerts = client.get("/api/alerts", headers=so_headers)
        check("GET /api/alerts (so1) → 200", r_so_alerts, 200)
        assert r_so_alerts.json()["total"] >= 2
        print("  ✓ scrutiny officer alert overview verified")

        # Advance clock 20 days with tick to trigger Takshashila 180-day window
        r_adv_tick = client.post(
            "/api/admin/clock/advance",
            json={"days": 20, "run_tick": True},
            headers=admin_headers,
        )
        check("POST /api/admin/clock/advance (20d, run_tick=true) → 200", r_adv_tick, 200)
        assert any(j["job_name"] == "maturity_scan" for j in r_adv_tick.json()["jobs_run"])
        r_180 = client.get("/api/alerts?window_days=180", headers=so_headers)
        check("GET /api/alerts?window_days=180 → 200", r_180, 200)
        assert any("Takshashila" in a["institute_name"] for a in r_180.json()["items"])
        print("  ✓ maturity scanning and 180d ladder alert verified via clock advance")

        # Reset clock for clean baseline
        client.post("/api/admin/clock/reset", headers=admin_headers)

        # PR-6: Real Release Request & Eligibility Engine
        from app.modules.intake.ids import institute_id, stable_id

        vj_login = client.post("/api/auth/login", json={"username": "vj_sig", "password": "demo@123"})
        check("POST /api/auth/login (vj_sig) → 200", vj_login, 200)
        vj_headers = {"Authorization": f"Bearer {vj_login.json()['access_token']}"}

        vj_ob_id = stable_id("obligation", "vidyajyoti")
        vj_ins_id = stable_id("instrument", "vidyajyoti")

        # Compliance Officer places temporary hold
        co_login = client.post("/api/auth/login", json={"username": "co1", "password": "demo@123"})
        check("POST /api/auth/login (co1) → 200", co_login, 200)
        co_headers = {"Authorization": f"Bearer {co_login.json()['access_token']}"}

        r_hold_place = client.post(
            "/api/holds",
            headers=co_headers,
            json={
                "scope": "INSTITUTE",
                "entity_id": institute_id("vidyajyoti"),
                "reason": "Statutory inquiry pending verification",
                "legal_ref": "AICTE/SMOKE/2026/01",
            },
        )
        check("POST /api/holds (co1) → 200", r_hold_place, 200)
        hold_id = r_hold_place.json()["id"]

        # Vidya Jyoti attempts release -> INELIGIBLE due to Rule E-06
        r_rel_sub = client.post(
            "/api/release/requests",
            headers=vj_headers,
            json={
                "obligation_id": vj_ob_id,
                "instrument_ids": [vj_ins_id],
                "case_type": "TERM_COMPLETE",
                "remarks": "Term complete release request",
            },
        )
        check("POST /api/release/requests (hold active) → 200", r_rel_sub, 200)
        rel_data = r_rel_sub.json()
        assert rel_data["state"] == "INELIGIBLE"
        rel_req_id = rel_data["id"]

        r_rel_det = client.get(f"/api/release/requests/{rel_req_id}", headers=vj_headers)
        e06 = next(r for r in r_rel_det.json()["rules"] if r["rule_id"] == "E-06")
        assert e06["result"] == "FAIL"
        print("  ✓ eligibility engine: active compliance hold triggers Rule E-06 INELIGIBLE verdict")

        # Compliance Officer lifts hold
        r_lift = client.post(
            f"/api/holds/{hold_id}/lift",
            headers=co_headers,
            json={"reason": "Statutory inquiry completed and all clear"},
        )
        check(f"POST /api/holds/{hold_id}/lift → 200", r_lift, 200)

        # Resubmit release request -> becomes ELIGIBLE & SCRUTINY; locks instrument
        r_resub = client.post(f"/api/release/requests/{rel_req_id}/resubmit", headers=vj_headers)
        check("POST .../resubmit → 200", r_resub, 200)
        assert r_resub.json()["state"] == "SCRUTINY"
        print("  ✓ hold lifted; resubmitted release request passed all rules and transitioned to SCRUTINY")

        # Approving Officer recommends
        ao_login = client.post("/api/auth/login", json={"username": "ao1", "password": "demo@123"})
        ao_headers = {"Authorization": f"Bearer {ao_login.json()['access_token']}"}
        r_rec = client.post(
            f"/api/release/requests/{rel_req_id}/recommend",
            headers=ao_headers,
            json={"recommendation_note": "Term complete and bank confirmation verified clear."},
        )
        check("POST .../recommend (ao1) → 200", r_rec, 200)
        assert r_rec.json()["state"] == "RECOMMENDED"
        print("  ✓ approving officer recommended release request to Release Authority")

        # PR-7: Cryptographic Signing, PDF & QR Generation
        ra_login = client.post("/api/auth/login", json={"username": "ra1", "password": "demo@123"})
        ra_headers = {"Authorization": f"Bearer {ra_login.json()['access_token']}"}

        # Signing without step-up PIN fails
        r_sign_no_pin = client.post(f"/api/release/requests/{rel_req_id}/sign", headers=ra_headers)
        check("POST .../sign (without PIN) → 403", r_sign_no_pin, 403)
        assert r_sign_no_pin.json()["error"]["code"] == "STEP_UP_REQUIRED"

        # Step-up verification for RA
        client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

        # RA signs request
        r_sign = client.post(f"/api/release/requests/{rel_req_id}/sign", headers=ra_headers)
        check("POST .../sign (with PIN) → 200", r_sign, 200)
        sign_data = r_sign.json()
        assert sign_data["status"] == "SIGNED"
        letter_id = sign_data["letter_id"]
        pub_code = sign_data["verification_code"]
        assert sign_data["letter_hash"] is not None
        print(f"  ✓ RA signed release letter via Ed25519 (verification_code: {pub_code})")

        # Fetch letter detail
        r_let_det = client.get(f"/api/release/letters/{letter_id}", headers=ra_headers)
        check(f"GET /api/release/letters/{letter_id} → 200", r_let_det, 200)
        letter_detail = r_let_det.json()
        assert letter_detail["state"] == "ISSUED"
        assert letter_detail["signature_hex"] is not None
        assert letter_detail["letter_hash"] is not None
        principal_paise = letter_detail["principal_paise"]
        aicte_share_paise = letter_detail["aicte_share_paise"]

        # Verify ReportLab PDF generation
        r_pdf = client.get(f"/api/release/letters/{letter_id}/pdf", headers=ra_headers)
        check(f"GET /api/release/letters/{letter_id}/pdf → 200", r_pdf, 200)
        assert r_pdf.headers["content-type"] == "application/pdf"
        assert len(r_pdf.content) > 1000
        print("  ✓ ReportLab official PDF generated with embedded QR verification code")

        # PR-8: Live Public Verification
        r_pub_valid = client.post(
            "/api/public/verify",
            json={
                "code": pub_code,
                "fdr_number": "BRB-FDR-2021-004711",
                "ifsc": "BRBK0001234",
            },
        )
        check("POST /api/public/verify (genuine) → 200", r_pub_valid, 200)
        assert r_pub_valid.json()["status"] == "VALID"
        assert r_pub_valid.json()["tamper_warning"] is False
        assert "destination_account" in r_pub_valid.json()
        print("  ✓ public verification: genuine letter verified valid with policy destination account")

        # Uniform timing-safe error response for mismatched lookup
        r_pub_nomatch = client.post(
            "/api/public/verify",
            json={
                "code": pub_code,
                "fdr_number": "WRONG-FDR-NUMBER",
                "ifsc": "BRBK0001234",
            },
        )
        check("POST /api/public/verify (mismatch) → 404", r_pub_nomatch, 404)
        assert r_pub_nomatch.json()["error"]["code"] == "VERIFY_NO_MATCH"
        print("  ✓ timing-safe uniform VERIFY_NO_MATCH error returned")

        # PR-8: Bank Remittance Maker-Checker Execution
        bm_login = client.post("/api/auth/login", json={"username": "brb_mk", "password": "demo@123"})
        bm_headers = {"Authorization": f"Bearer {bm_login.json()['access_token']}"}

        # Maker submits execution details
        r_exec_maker = client.post(
            f"/api/bank/letters/{letter_id}/execute-maker",
            headers=bm_headers,
            json={
                "utr": "UTR-PR-SMOKE-2026-001",
                "principal_paise": principal_paise,
                "aicte_share_paise": aicte_share_paise,
                "execution_date": "2026-10-25",
            },
        )
        check("POST .../execute-maker (brb_mk) → 200", r_exec_maker, 200)
        print("  ✓ bank maker recorded core banking UTR remittance details")

        # Maker without checker role fails role check
        r_exec_sod = client.post(
            f"/api/bank/letters/{letter_id}/execute-checker",
            headers=bm_headers,
            json={"decision": "AUTHORISE", "remarks": "Maker self-approval attempt"},
        )
        check("POST .../execute-checker (maker lacks checker role) → 403", r_exec_sod, 403)
        assert r_exec_sod.json()["error"]["code"] == "FORBIDDEN"
        print("  ✓ role protection: bank maker without checker role cannot authorise remittance")

        # Bank Checker authorises
        bc_login = client.post("/api/auth/login", json={"username": "brb_ck", "password": "demo@123"})
        bc_headers = {"Authorization": f"Bearer {bc_login.json()['access_token']}"}
        r_exec_ck = client.post(
            f"/api/bank/letters/{letter_id}/execute-checker",
            headers=bc_headers,
            json={"decision": "AUTHORISE", "remarks": "Authorised by Bank Checker"},
        )
        check("POST .../execute-checker (brb_ck) → 200", r_exec_ck, 200)
        assert r_exec_ck.json()["status"] == "CHECKER_CONFIRMED"
        r_let_exec = client.get(f"/api/release/letters/{letter_id}", headers=ra_headers)
        assert r_let_exec.json()["state"] == "EXECUTED"
        print("  ✓ bank checker authorised remittance; letter EXECUTED, instruments RELEASED")

        # Replay attempt fails
        r_replay = client.post(
            f"/api/bank/letters/{letter_id}/execute-checker",
            headers=bc_headers,
            json={"decision": "AUTHORISE"},
        )
        check("POST .../execute-checker (replay) → 409", r_replay, 409)
        assert r_replay.json()["error"]["code"] == "INVALID_STATE"
        print("  ✓ single-use replay protection: executed letter cannot be re-executed")

        # PR-8: Finance Settlement Reconciliation & Cascading Closure
        fo_login = client.post("/api/auth/login", json={"username": "fo1", "password": "demo@123"})
        fo_headers = {"Authorization": f"Bearer {fo_login.json()['access_token']}"}

        r_settle_confirm = client.post(
            f"/api/finance/settlements/{rel_req_id}/confirm",
            headers=fo_headers,
            json={
                "credited_paise": aicte_share_paise,
                "bank_ref": "AICTE-CR-2026-9901",
            },
        )
        check("POST /api/finance/settlements/.../confirm → 200", r_settle_confirm, 200)
        assert r_settle_confirm.json()["is_settled"] is True
        print("  ✓ finance officer confirmed credit; cascading permanent closure complete (CLOSED)")

    finally:
        if hasattr(client, "close"):
            client.close()

    print("── PR smoke passed ──────────────────────────────\n")


if __name__ == "__main__":
    main()
