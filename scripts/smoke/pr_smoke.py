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

    try:
        with httpx.Client(base_url=BASE, timeout=10) as client:
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

    except httpx.ConnectError:
        print(f"  ✗ Cannot connect to {BASE}. Ensure backend is running ('make run').")
        sys.exit(1)

    print("── PR smoke passed ──────────────────────────────\n")


if __name__ == "__main__":
    main()
