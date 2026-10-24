"""
Unit tests for Monitoring stub router (§3.5).
"""
from fastapi.testclient import TestClient
import pytest

from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.seed import seed as seed_core
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_monitoring_db():
    create_tables()
    seed_core()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200
    return res.json()["access_token"]


def test_alerts_endpoint_officer():
    """Verify Scrutiny Officer can list all alerts."""
    so_token = get_token("so1")
    res = client.get("/api/alerts", headers={"Authorization": f"Bearer {so_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert data["total"] >= 2
    assert any(a["window_days"] == 180 for a in data["items"])


def test_alerts_endpoint_scoped_institute():
    """Verify Institute Signatory is scoped strictly to their institute."""
    ar_token = get_token("ar_sig")
    res = client.get("/api/alerts", headers={"Authorization": f"Bearer {ar_token}"})
    assert res.status_code == 200
    data = res.json()
    assert all("Aryabhatta" in a["institute_name"] for a in data["items"])


def test_alerts_unauthenticated():
    """Verify unauthenticated requests are blocked."""
    res = client.get("/api/alerts")
    assert res.status_code == 401

