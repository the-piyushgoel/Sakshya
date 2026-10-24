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

    except httpx.ConnectError:
        print(f"  ✗ Cannot connect to {BASE}. Ensure backend is running ('make run').")
        sys.exit(1)

    print("── PR smoke passed ──────────────────────────────\n")


if __name__ == "__main__":
    main()
