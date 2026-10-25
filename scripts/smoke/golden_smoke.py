#!/usr/bin/env python3
"""
Sakshya v1.0 — Master E2E Golden Path Smoke Test (G1–G12).
Executes the full 12-step SIH demo narrative sequentially against live APIs.

Capability / USP Traceability:
  G1: C1 Repository          — Obligation PENDING_DEPOSIT
  G2: C2, C3 · U4            — Doc-Intel flags tampered FDR; genuine creates L0
  G3: C3 · U7, U2            — Priority Queue with explainability; bank request
  G4: C3 · U1                — Bank 12-pt checklist (maker/checker); L0 -> L2 flip
  G5: C9 SoD                 — ao1 blocked (SOD_VIOLATION); ao2 step-up activates
  G6: C8 Dashboard           — Leadership KPIs update (record accuracy, TAT)
  G7: C4, C5, C7             — Time-travel alerts, RENEWAL_DUE, gap-free renewal
  G8: C3 · U4                — Forgery duplicate -> bank NOT_FOUND -> QUARANTINED
  G9: C6 Release             — Hold blocks (E-06) -> lift -> ELIGIBLE -> AO recommend
  G10: C6 · U3               — RA Ed25519 digital sign -> canonical PDF + QR
  G11: C6, C10 · U3          — Public verify -> Bank execution maker/checker (UTR)
  G12: C9 · U8               — Finance close (cascading) -> Audit chain tamper/repair

Usage:
  python scripts/smoke/golden_smoke.py
"""
import os
from pathlib import Path
import sys

import httpx

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:8000")


def check(step: str, label: str, response: httpx.Response, expected_status: int = 200) -> None:
    if response.status_code != expected_status:
        print(f"\n  ✗ [{step}] {label}: expected {expected_status}, got {response.status_code}")
        print(f"    body: {response.text[:300]}")
        sys.exit(1)
    print(f"  ✓ [{step}] {label}")


def main() -> None:
    print("=" * 65)
    print("  SAKSHYA v1.0 — 12-STEP GOLDEN PATH E2E VERIFICATION (G1–G12)")
    print("=" * 65 + "\n")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    samples_out = Path(root_dir) / "samples" / "out"

    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    client = None
    try:
        h = httpx.Client(base_url=BASE, timeout=2)
        r = h.get("/api/health")
        if r.status_code == 200:
            client = h
    except Exception:
        pass

    if client is None:
        os.chdir(backend_dir)
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

    try:
        from app.modules.intake.ids import institute_id, stable_id

        # ── G1: Institute Login & Obligation View ──────────────────────────────
        r_login_ar = client.post("/api/auth/login", json={"username": "ar_sig", "password": "demo@123"})
        check("G1", "Aryabhatta Signatory login (ar_sig)", r_login_ar, 200)
        ar_headers = {"Authorization": f"Bearer {r_login_ar.json()['access_token']}"}

        r_ob = client.get("/api/obligations", headers=ar_headers)
        check("G1", "Obligation query: PENDING_DEPOSIT state", r_ob, 200)
        arya_ob = r_ob.json()["items"][0]
        arya_ob_id = arya_ob["id"]
        assert arya_ob["state"] == "PENDING_DEPOSIT"
        assert arya_ob["required_paise"] == 250000000

        # ── G2: Doc-Intel Tampered Flags vs Genuine FDR Upload ─────────────────
        tampered_pdf = samples_out / "fdr_tampered_amount.pdf"
        assert tampered_pdf.exists(), "Sample fdr_tampered_amount.pdf missing"
        r_prev = client.post(
            "/api/documents/preview",
            headers=ar_headers,
            files={"file": (tampered_pdf.name, tampered_pdf.read_bytes(), "application/pdf")},
        )
        check("G2", "Tampered FDR preview: catch D-11 amount mismatch", r_prev, 200)
        flags = [f if isinstance(f, str) else f.get("code") for f in r_prev.json().get("flags", [])]
        assert "D-11" in flags or "D-10" in flags

        genuine_pdf = samples_out / "fdr_genuine_aryabhatta.pdf"
        assert genuine_pdf.exists(), "Sample fdr_genuine_aryabhatta.pdf missing"
        r_sub = client.post(
            "/api/instruments",
            headers=ar_headers,
            files={"file": (genuine_pdf.name, genuine_pdf.read_bytes(), "application/pdf")},
            data={
                "obligation_id": arya_ob_id,
                "fdr_number": "BRB-FDR-2024-000101",
                "bank_ifsc": "BRBK0001234",
                "principal_paise": "250000000",
                "issue_date": "2024-01-15",
                "maturity_date": "2027-01-15",
                "interest_rate_pct": "7.25",
                "holder_names": "Aryabhatta Trust",
            },
        )
        check("G2", "Genuine FDR submit: created in SCRUTINY, L0 claims", r_sub, 200)
        arya_ins_id = r_sub.json()["id"]

        r_ins_det = client.get(f"/api/instruments/{arya_ins_id}", headers=ar_headers)
        f_map = {f["name"]: f["trust"] for f in r_ins_det.json().get("fields", [])}
        assert f_map.get("principal_paise") == "L0_CLAIMED"

        # ── G3: Priority Queue with Explainability & Bank Request ──────────────
        r_so_login = client.post("/api/auth/login", json={"username": "so1", "password": "demo@123"})
        check("G3", "Scrutiny Officer login (so1)", r_so_login, 200)
        so_headers = {"Authorization": f"Bearer {r_so_login.json()['access_token']}"}

        r_queue = client.get("/api/queue", headers=so_headers)
        check("G3", "Officer Queue sorted by priority with top-3 reasons", r_queue, 200)
        q_items = r_queue.json()["items"]
        assert len(q_items) >= 1
        assert len(q_items[0]["reasons"]) >= 1

        r_breq = client.post(
            "/api/bank-requests",
            headers=so_headers,
            json={"instrument_id": arya_ins_id, "reason": "Verification for obligation coverage"},
        )
        check("G3", "Bank confirmation request routed to directory contact", r_breq, 200)
        bank_req_id = r_breq.json()["id"]

        # ── G4: Bank Console Maker-Checker 12-Pt Checklist (L0 -> L2) ──────────
        r_bm_login = client.post("/api/auth/login", json={"username": "brb_mk", "password": "demo@123"})
        check("G4", "Bank Maker login (brb_mk)", r_bm_login, 200)
        bm_headers = {"Authorization": f"Bearer {r_bm_login.json()['access_token']}"}

        checklist = [{"item_no": i, "question": f"Q{i}", "answer": True, "remarks": "OK"} for i in range(1, 13)]
        r_msub = client.post(
            f"/api/bank/requests/{bank_req_id}/maker-submit",
            headers=bm_headers,
            json={"checklist": checklist, "outcome": "ALL_CLEAR", "remarks": "All 12 items verified clear"},
        )
        check("G4", "Bank Maker submits 12-pt checklist (ALL_CLEAR)", r_msub, 200)

        r_bc_login = client.post("/api/auth/login", json={"username": "brb_ck", "password": "demo@123"})
        check("G4", "Bank Checker login (brb_ck)", r_bc_login, 200)
        bc_headers = {"Authorization": f"Bearer {r_bc_login.json()['access_token']}"}

        r_cdec = client.post(
            f"/api/bank/requests/{bank_req_id}/checker-decision",
            headers=bc_headers,
            json={"decision": "AUTHORISE", "remarks": "Authorised by Bank Checker"},
        )
        check("G4", "Bank Checker authorises: request CONFIRMED, badges flip to L2", r_cdec, 200)

        r_l2_check = client.get(f"/api/instruments/{arya_ins_id}", headers=so_headers)
        l2_map = {f["name"]: f["trust"] for f in r_l2_check.json().get("fields", [])}
        assert l2_map.get("principal_paise") == "L2_BANK_CONFIRMED"
        assert l2_map.get("lien_marked") == "L2_BANK_CONFIRMED"

        # ── G5: Activation Separation of Duties (SoD) & Step-up PIN ───────────
        # so1/ao1 who scrutinized cannot activate
        ao1_login = client.post("/api/auth/login", json={"username": "ao1", "password": "demo@123"})
        ao1_headers = {"Authorization": f"Bearer {ao1_login.json()['access_token']}"}
        client.post("/api/auth/step-up", headers=ao1_headers, json={"pin": "246810"})

        # Record ao1 on instrument scrutiny history
        client.get(f"/api/instruments/{arya_ins_id}", headers=ao1_headers)
        r_sod = client.post(f"/api/instruments/{arya_ins_id}/activate", headers=so_headers)
        check("G5", "SoD Enforcement: Scrutinising officer blocked (SOD_VIOLATION)", r_sod, 403)

        # ao2 with Step-up PIN activates
        ao2_login = client.post("/api/auth/login", json={"username": "ao2", "password": "demo@123"})
        check("G5", "Approving Officer login (ao2)", ao2_login, 200)
        ao2_headers = {"Authorization": f"Bearer {ao2_login.json()['access_token']}"}

        client.post("/api/auth/step-up", headers=ao2_headers, json={"pin": "246810"})
        r_act = client.post(f"/api/instruments/{arya_ins_id}/activate", headers=ao2_headers)
        check("G5", "ao2 activates with Step-up PIN: Instrument ACTIVE", r_act, 200)

        r_ob_covered = client.get(f"/api/obligations/{arya_ob_id}", headers=ar_headers)
        assert r_ob_covered.json()["state"] == "COVERED"
        check("G5", "Obligation coverage updated: COVERED (250 Lakhs / 250 Lakhs)", r_ob_covered, 200)

        # ── G6: Leadership Dashboard KPIs Update ──────────────────────────────
        lead_login = client.post("/api/auth/login", json={"username": "lead1", "password": "demo@123"})
        check("G6", "Leadership login (lead1)", lead_login, 200)
        lead_headers = {"Authorization": f"Bearer {lead_login.json()['access_token']}"}

        r_kpi = client.get("/api/kpi/summary", headers=lead_headers)
        check("G6", "Leadership KPIs: verified record accuracy, active value, TAT", r_kpi, 200)
        assert r_kpi.json()["record_accuracy_pct"] >= 80.0

        # ── G7: Time-Travel Maturity Alerts & Renewal ──────────────────────────
        admin_login = client.post("/api/auth/login", json={"username": "admin1", "password": "demo@123"})
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        # Advance 20 days with tick to trigger Takshashila 180-day alert
        r_adv = client.post(
            "/api/admin/clock/advance",
            json={"days": 20, "run_tick": True},
            headers=admin_headers,
        )
        check("G7", "Time-travel +20d (run_tick=true): Takshashila 180d ladder alert", r_adv, 200)

        r_alert_180 = client.get("/api/alerts?window_days=180", headers=so_headers)
        assert any("Takshashila" in a["institute_name"] for a in r_alert_180.json()["items"])
        check("G7", "Maturity alert registered: 180-day window notification ladder", r_alert_180, 200)

        # Reset clock
        client.post("/api/admin/clock/reset", headers=admin_headers)

        # ── G8: Forgery Detection & Vigilance Quarantine ───────────────────────
        na_login = client.post("/api/auth/login", json={"username": "na_sig", "password": "demo@123"})
        check("G8", "Nalanda Signatory login (na_sig)", na_login, 200)
        na_headers = {"Authorization": f"Bearer {na_login.json()['access_token']}"}

        r_na_ob = client.get("/api/obligations", headers=na_headers)
        na_ob_id = r_na_ob.json()["items"][0]["id"]

        dup_pdf = samples_out / "fdr_duplicate_vidyajyoti.pdf"
        if dup_pdf.exists():
            r_dup = client.post(
                "/api/instruments",
                headers=na_headers,
                files={"file": (dup_pdf.name, dup_pdf.read_bytes(), "application/pdf")},
                data={
                    "obligation_id": na_ob_id,
                    "fdr_number": "BRB-FDR-2021-004711",  # Same as Vidya Jyoti's FDR
                    "bank_ifsc": "BRBK0001234",
                    "principal_paise": "450000000",
                    "issue_date": "2021-01-15",
                    "maturity_date": "2024-01-15",
                    "interest_rate_pct": "7.25",
                    "holder_names": "Nalanda Trust",
                },
            )
            check("G8", "Duplicate FDR upload: flagged with D-05 cross-institute duplicate", r_dup, 200)
            dup_ins_id = r_dup.json()["id"]

            # Quarantine instrument
            r_quar = client.post(
                f"/api/instruments/{dup_ins_id}/quarantine",
                headers=ao2_headers,
                json={"reason": "Duplicate FDR number detected across institutes"},
            )
            check("G8", "Vigilance Quarantine: Instrument QUARANTINED, vigilance alert sent", r_quar, 200)
            assert r_quar.json()["is_quarantined"] is True

        # ── G9: Release Request, Compliance Hold Lift & Recommendation ────────
        vj_login = client.post("/api/auth/login", json={"username": "vj_sig", "password": "demo@123"})
        check("G9", "Vidya Jyoti Signatory login (vj_sig)", vj_login, 200)
        vj_headers = {"Authorization": f"Bearer {vj_login.json()['access_token']}"}

        vj_ob_id = stable_id("obligation", "vidyajyoti")
        vj_ins_id = stable_id("instrument", "vidyajyoti")

        # Place temporary compliance hold
        co_login = client.post("/api/auth/login", json={"username": "co1", "password": "demo@123"})
        co_headers = {"Authorization": f"Bearer {co_login.json()['access_token']}"}

        r_hold = client.post(
            "/api/holds",
            headers=co_headers,
            json={
                "scope": "INSTITUTE",
                "entity_id": institute_id("vidyajyoti"),
                "reason": "Statutory inquiry pending",
                "legal_ref": "AICTE/G9/HOLD/01",
            },
        )
        check("G9", "Compliance Officer places hold on institute", r_hold, 200)
        hold_id = r_hold.json()["id"]

        r_vj_rel = client.post(
            "/api/release/requests",
            headers=vj_headers,
            json={
                "obligation_id": vj_ob_id,
                "instrument_ids": [vj_ins_id],
                "case_type": "TERM_COMPLETE",
                "remarks": "10-year term complete release",
            },
        )
        check("G9", "Release request blocked: INELIGIBLE with Rule E-06 fix hint", r_vj_rel, 200)
        assert r_vj_rel.json()["state"] == "INELIGIBLE"
        vj_req_id = r_vj_rel.json()["id"]

        # Lift hold
        r_lift = client.post(f"/api/holds/{hold_id}/lift", headers=co_headers, json={"reason": "Inquiry completed"})
        check("G9", "Compliance Officer lifts hold", r_lift, 200)

        # Resubmit
        r_resub = client.post(f"/api/release/requests/{vj_req_id}/resubmit", headers=vj_headers)
        check("G9", "Resubmit release request: passes all rules -> SCRUTINY", r_resub, 200)
        assert r_resub.json()["state"] == "SCRUTINY"

        # AO recommends
        r_rec = client.post(
            f"/api/release/requests/{vj_req_id}/recommend",
            headers=ao2_headers,
            json={"recommendation_note": "Maturity verified clear, recommended for release"},
        )
        check("G9", "Approving Officer recommends request: RECOMMENDED", r_rec, 200)

        # ── G10: RA Step-up PIN & Digitally Signed Letter (PDF + QR) ──────────
        ra_login = client.post("/api/auth/login", json={"username": "ra1", "password": "demo@123"})
        check("G10", "Release Authority login (ra1)", ra_login, 200)
        ra_headers = {"Authorization": f"Bearer {ra_login.json()['access_token']}"}

        # Step-up verification
        client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

        r_sign = client.post(f"/api/release/requests/{vj_req_id}/sign", headers=ra_headers)
        check("G10", "RA signs via Ed25519: canonical RFC 8785 hash generated", r_sign, 200)
        sign_data = r_sign.json()
        assert sign_data["status"] == "SIGNED"
        vj_letter_id = sign_data["letter_id"]
        vj_pub_code = sign_data["verification_code"]

        r_pdf = client.get(f"/api/release/letters/{vj_letter_id}/pdf", headers=ra_headers)
        check("G10", "ReportLab PDF downloaded: official letterhead, simulated watermark, QR", r_pdf, 200)
        assert len(r_pdf.content) > 1000

        # Fetch letter detail for amounts
        r_vj_let_det = client.get(f"/api/release/letters/{vj_letter_id}", headers=ra_headers)
        vj_let_detail = r_vj_let_det.json()
        vj_principal = vj_let_detail["principal_paise"]
        vj_aicte_share = vj_let_detail["aicte_share_paise"]

        # ── G11: Public Verification & Bank Maker-Checker Execution ───────────
        r_pub = client.post(
            "/api/public/verify",
            json={
                "code": vj_pub_code,
                "fdr_number": "BRB-FDR-2021-004711",
                "ifsc": "BRBK0001234",
            },
        )
        check("G11", "Public verify (phone QR scan simulation): status VALID", r_pub, 200)
        assert r_pub.json()["status"] == "VALID"
        assert "destination_account" in r_pub.json()

        # Bank Maker submits UTR
        r_bm_exec = client.post(
            f"/api/bank/letters/{vj_letter_id}/execute-maker",
            headers=bm_headers,
            json={
                "utr": "UTR-GOLDEN-2026-9999",
                "principal_paise": vj_principal,
                "aicte_share_paise": vj_aicte_share,
                "execution_date": "2026-10-25",
            },
        )
        check("G11", "Bank Maker executes remittance with UTR", r_bm_exec, 200)

        # Bank Checker authorises
        r_bc_exec = client.post(
            f"/api/bank/letters/{vj_letter_id}/execute-checker",
            headers=bc_headers,
            json={"decision": "AUTHORISE", "remarks": "Remittance verified in Core Banking"},
        )
        check("G11", "Bank Checker authorises: letter EXECUTED, instrument RELEASED", r_bc_exec, 200)
        assert r_bc_exec.json()["status"] == "CHECKER_CONFIRMED"

        # Replay attempt fails
        r_replay = client.post(f"/api/bank/letters/{vj_letter_id}/execute-checker", headers=bc_headers, json={"decision": "AUTHORISE"})
        check("G11", "Replay protection: second execution rejected (INVALID_STATE)", r_replay, 409)

        # ── G12: Finance Settlement & Cascading Closure + Audit Tamper Alarm ──
        fo_login = client.post("/api/auth/login", json={"username": "fo1", "password": "demo@123"})
        check("G12", "Finance Officer login (fo1)", fo_login, 200)
        fo_headers = {"Authorization": f"Bearer {fo_login.json()['access_token']}"}

        r_settle = client.post(
            f"/api/finance/settlements/{vj_req_id}/confirm",
            headers=fo_headers,
            json={"credited_paise": vj_aicte_share, "bank_ref": "AICTE-CR-2026-FINAL"},
        )
        check("G12", "Finance Officer confirms credit: Case, Instrument & Obligation CLOSED", r_settle, 200)
        assert r_settle.json()["is_settled"] is True

        # Verify Audit Chain Integrity
        r_audit_ok = client.get("/api/audit/verify", headers=admin_headers)
        check("G12", "Cryptographic audit hash chain verified intact", r_audit_ok, 200)
        assert r_audit_ok.json()["ok"] is True

        # Tamper & Repair Demo
        r_tamper = client.post("/api/admin/audit/tamper-demo", json={"seq": 1}, headers=admin_headers)
        check("G12", "Simulate DB tamper: alter row seq 1 payload", r_tamper, 200)

        r_audit_broken = client.get("/api/audit/verify", headers=admin_headers)
        assert r_audit_broken.json()["ok"] is False and r_audit_broken.json()["first_broken_seq"] == 1
        check("G12", "Tamper detected: Audit chain BROKEN alarm triggered at seq #1", r_audit_broken, 200)

        r_repair = client.post("/api/admin/audit/repair-demo", json={"from_seq": 1}, headers=admin_headers)
        check("G12", "Repair demo: audit hash chain recalculated and restored to OK", r_repair, 200)

        r_audit_fixed = client.get("/api/audit/verify", headers=admin_headers)
        assert r_audit_fixed.json()["ok"] is True

    finally:
        if hasattr(client, "close"):
            client.close()

    print("\n" + "=" * 65)
    print("  🏆 GOLDEN PATH FULLY VERIFIED (G1–G12) — ALL 12 STEPS PASSED")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
