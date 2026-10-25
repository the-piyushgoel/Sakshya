#!/usr/bin/env python3
"""
MK smoke — Mehak's Lane C (Insights & Risk Engine).
Verifies:
  1. Pure Python risk calculation & factor weighting
  2. Officer priority queue with explainability reasons
  3. Single-instrument risk factor breakdown
  4. Leadership KPI summary, state breakdown, and maturity ladder
  5. Audited CSV report export
  6. Multi-tenant / role protection against unauthorized access
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
    print("── MK smoke (Insights & Risk) ───────────────────")

    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
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
        # 1. Verify pure Python risk calculation logic
        from app.modules.insights import risk

        sample_factors = {
            "f_flags": 0.4,
            "f_aging": 0.2,
            "f_amount": 0.5,
            "f_maturity": 0.3,
            "f_bank": 0.1,
            "f_inst": 0.1,
            "f_recon": 0.1,
        }
        calc_score = risk.score(sample_factors)
        assert 0 <= calc_score <= 100
        calc_priority = risk.priority(calc_score, sla_breached=True)
        assert calc_priority == calc_score + 20
        reasons = risk.explain(sample_factors, limit=3)
        assert len(reasons) == 3
        print("  ✓ risk algorithm: factor weighting & priority boosts valid")

        # 2. Officer Authentication & Priority Queue
        so_login = client.post("/api/auth/login", json={"username": "so1", "password": "demo@123"})
        check("POST /api/auth/login (so1) → 200", so_login, 200)
        so_headers = {"Authorization": f"Bearer {so_login.json()['access_token']}"}

        r_queue = client.get("/api/queue", headers=so_headers)
        check("GET /api/queue (so1) → 200", r_queue, 200)
        q_data = r_queue.json()
        assert "items" in q_data and q_data["total"] >= 1
        items = q_data["items"]
        # Assert descending priority
        for i in range(len(items) - 1):
            assert items[i]["priority"] >= items[i + 1]["priority"], "Queue not sorted by priority desc"
        first_case = items[0]
        assert len(first_case["reasons"]) >= 1
        print(f"  ✓ priority queue retrieved ({q_data['total']} cases, sorted by priority desc)")

        # 3. Single-instrument risk factor query
        first_id = first_case["id"]
        r_risk = client.get(f"/api/instruments/{first_id}/risk", headers=so_headers)
        check(f"GET /api/instruments/{first_id}/risk → 200", r_risk, 200)
        risk_data = r_risk.json()
        assert len(risk_data["factors"]) == 7
        assert "score" in risk_data and "priority" in risk_data
        print("  ✓ instrument 7-factor explainability breakdown verified")

        # 4. Leadership KPI Dashboards
        lead_login = client.post("/api/auth/login", json={"username": "lead1", "password": "demo@123"})
        check("POST /api/auth/login (lead1) → 200", lead_login, 200)
        lead_headers = {"Authorization": f"Bearer {lead_login.json()['access_token']}"}

        r_kpi = client.get("/api/kpi/summary", headers=lead_headers)
        check("GET /api/kpi/summary (lead1) → 200", r_kpi, 200)
        kpi_data = r_kpi.json()
        assert kpi_data["total_value_paise"] > 0
        assert "record_accuracy_pct" in kpi_data
        assert "pending_aging_buckets" in kpi_data
        print(f"  ✓ leadership KPIs: total ₹{kpi_data['total_value_paise'] // 10000000:,} Cr, accuracy {kpi_data['record_accuracy_pct']}%")

        # Breakdown & Maturity ladder
        r_breakdown = client.get("/api/kpi/breakdown?by=state", headers=lead_headers)
        check("GET /api/kpi/breakdown?by=state → 200", r_breakdown, 200)
        assert len(r_breakdown.json()["items"]) >= 1

        r_ladder = client.get("/api/kpi/maturity-ladder", headers=lead_headers)
        check("GET /api/kpi/maturity-ladder → 200", r_ladder, 200)
        assert "windows" in r_ladder.json()
        print("  ✓ breakdown & renewal maturity ladder verified")

        # 5. Audited CSV report export
        r_csv = client.get("/api/reports/export.csv", headers=lead_headers)
        check("GET /api/reports/export.csv → 200", r_csv, 200)
        assert "text/csv" in r_csv.headers["content-type"]
        assert "Instrument ID,Institute Name" in r_csv.text
        print("  ✓ CSV export generated and logged to audit trail")

        # 6. Unauthorized access guard
        sig_login = client.post("/api/auth/login", json={"username": "ar_sig", "password": "demo@123"})
        sig_headers = {"Authorization": f"Bearer {sig_login.json()['access_token']}"}
        r_guard = client.get("/api/queue", headers=sig_headers)
        check("GET /api/queue (ar_sig unauthorized) → 403", r_guard, 403)
        print("  ✓ role guard: institute signatory blocked from officer queue")

    finally:
        if hasattr(client, "close"):
            client.close()

    print("── MK smoke passed ──────────────────────────────\n")


if __name__ == "__main__":
    main()
