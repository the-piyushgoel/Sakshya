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

    with httpx.Client(base_url=BASE, timeout=10) as client:
        # PR-1: Health
        r = client.get("/api/health")
        check("GET /api/health → 200", r, 200)
        assert r.json()["status"] == "ok", "health.status != ok"
        print("  ✓ health.status == ok")

        # PR-2 through PR-8 smoke steps added here as they're completed

    print("── PR smoke passed ──────────────────────────────\n")


if __name__ == "__main__":
    main()

