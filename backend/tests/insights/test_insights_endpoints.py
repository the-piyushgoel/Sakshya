"""Integration tests for the Insights module router endpoints."""
from fastapi.testclient import TestClient

from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.ids import stable_id
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from app.modules.release.seed import seed as seed_release

client = TestClient(app)


def setup_module():
    drop_tables()
    create_tables()
    clock.reset()
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    seed_release()


def teardown_module():
    drop_tables()
    clock.reset()


def auth(username: str) -> dict[str, str]:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_queue_endpoint():
    """GET /api/queue returns sorted items by priority for officers."""
    headers = auth("so1")
    res = client.get("/api/queue", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1

    items = data["items"]
    # Check descending priority sort
    for i in range(len(items) - 1):
        assert items[i]["priority"] >= items[i + 1]["priority"]

    first = items[0]
    assert "score" in first
    assert "priority" in first
    assert "reasons" in first
    assert isinstance(first["reasons"], list)


def test_instrument_risk_endpoint():
    """GET /api/instruments/{id}/risk returns factor breakdown."""
    headers = auth("so1")
    ins_id = stable_id("instrument", "filler-02")
    res = client.get(f"/api/instruments/{ins_id}/risk", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["instrument_id"] == ins_id
    assert 0 <= data["score"] <= 100
    assert "factors" in data
    assert len(data["factors"]) == 7
    assert "reasons" in data


def test_kpi_summary_endpoint():
    """GET /api/kpi/summary returns accurate metric totals for leadership."""
    headers = auth("lead1")
    res = client.get("/api/kpi/summary", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_value_paise"] > 0
    assert "record_accuracy_pct" in data
    assert "pending_aging_buckets" in data
    assert "as_of" in data


def test_kpi_breakdown_and_ladder():
    """GET /api/kpi/breakdown and /api/kpi/maturity-ladder return structured windows."""
    headers = auth("lead1")

    res_state = client.get("/api/kpi/breakdown?by=state", headers=headers)
    assert res_state.status_code == 200
    assert len(res_state.json()["items"]) >= 1

    res_bank = client.get("/api/kpi/breakdown?by=bank", headers=headers)
    assert res_bank.status_code == 200
    assert len(res_bank.json()["items"]) >= 1

    res_ladder = client.get("/api/kpi/maturity-ladder", headers=headers)
    assert res_ladder.status_code == 200
    assert "windows" in res_ladder.json()
    assert "0_30_days" in res_ladder.json()["windows"]


def test_reports_export_csv():
    """GET /api/reports/export.csv produces downloadable CSV and logs audit event."""
    headers = auth("lead1")
    res = client.get("/api/reports/export.csv", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers["content-disposition"]
    content = res.text
    assert "Instrument ID,Institute Name" in content


def test_role_guard():
    """Institute signatories should be forbidden from officer queue and KPIs."""
    sig_headers = auth("ar_sig")
    res_queue = client.get("/api/queue", headers=sig_headers)
    assert res_queue.status_code == 403

    res_kpi = client.get("/api/kpi/summary", headers=sig_headers)
    assert res_kpi.status_code == 403
