"""
Unit and integration tests for PR-2: Authentication, Roles, SoD, and Step-up.
"""
from datetime import timedelta
import os

from fastapi import Depends
from fastapi.testclient import TestClient
import pytest

from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.deps import get_current_user, require_roles, require_step_up
from app.core.enums import Role
from app.core.errors import SodViolationError
from app.core.models import User
from app.core.seed import seed as seed_core
from app.core.sod import ensure_different
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_auth_db():
    """Ensure core tables and seed users exist for auth tests."""
    create_tables()
    seed_core()
    yield
    drop_tables()

# Dummy test endpoints to verify dependency enforcement
@app.get("/api/test-role-ao", tags=["test"])
def _test_ao_only(user: User = Depends(require_roles(Role.APPROVING_OFFICER))):
    return {"status": "ok", "user": user.username}


@app.get("/api/test-privileged-action", tags=["test"])
def _test_step_up_only(user: User = Depends(require_step_up)):
    return {"status": "ok", "user": user.username, "step_up": True}


def test_seed_users_created():
    """Verify all 20 seed accounts exist and passwords are encrypted."""
    session = SessionLocal()
    users = session.query(User).all()
    assert len(users) == 20
    for u in users:
        assert u.password_hash.startswith("$2")
        assert u.password_hash != "demo@123"
    session.close()


def test_login_success_and_failure():
    """Verify POST /auth/login handles valid and invalid credentials."""
    # 1. Valid login
    res = client.post("/api/auth/login", json={"username": "ar_sig", "password": "demo@123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["username"] == "ar_sig"
    assert data["user"]["roles"] == ["INS_SIGNATORY"]
    assert data["user"]["institute_id"] is not None

    # 2. Invalid password
    bad_res = client.post("/api/auth/login", json={"username": "ar_sig", "password": "wrongpassword"})
    assert bad_res.status_code == 401
    assert bad_res.json()["error"]["code"] == "UNAUTHENTICATED"

    # 3. Unknown user
    unknown_res = client.post("/api/auth/login", json={"username": "nonexistent", "password": "demo@123"})
    assert unknown_res.status_code == 401
    assert unknown_res.json()["error"]["code"] == "UNAUTHENTICATED"


def test_get_me():
    """Verify GET /me returns current user details with valid token."""
    login_res = client.post("/api/auth/login", json={"username": "ao2", "password": "demo@123"})
    token = login_res.json()["access_token"]

    # Valid token
    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["username"] == "ao2"
    assert Role.APPROVING_OFFICER.value in res.json()["roles"]

    # Missing token
    no_auth = client.get("/api/me")
    assert no_auth.status_code == 401
    assert no_auth.json()["error"]["code"] == "UNAUTHENTICATED"


def test_require_roles_enforcement():
    """Verify require_roles blocks unauthorized roles with 403 FORBIDDEN."""
    # Login as ao2 (has APPROVING_OFFICER)
    token_ao2 = client.post("/api/auth/login", json={"username": "ao2", "password": "demo@123"}).json()["access_token"]
    res_ao2 = client.get("/api/test-role-ao", headers={"Authorization": f"Bearer {token_ao2}"})
    assert res_ao2.status_code == 200
    assert res_ao2.json()["status"] == "ok"

    # Login as ar_sig (only has INS_SIGNATORY)
    token_sig = client.post("/api/auth/login", json={"username": "ar_sig", "password": "demo@123"}).json()["access_token"]
    res_sig = client.get("/api/test-role-ao", headers={"Authorization": f"Bearer {token_sig}"})
    assert res_sig.status_code == 403
    assert res_sig.json()["error"]["code"] == "FORBIDDEN"


def test_sod_ensure_different():
    """Verify Segregation of Duties logic raises SodViolationError."""
    session = SessionLocal()
    ao1 = session.query(User).filter(User.username == "ao1").first()
    so2 = session.query(User).filter(User.username == "so2").first()

    # Different users -> passes
    ensure_different(ao1, so2.id, "Scrutiny officer cannot approve")

    # Same user -> raises SodViolationError (403, SOD_VIOLATION)
    with pytest.raises(SodViolationError) as exc_info:
        ensure_different(ao1, ao1.id, "Scrutiny officer cannot approve")
    assert exc_info.value.code == "SOD_VIOLATION"
    assert exc_info.value.status == 403

    session.close()


def test_step_up_lifecycle():
    """Verify full step-up authentication flow: error -> PIN -> pass -> clock expiry -> error."""
    clock.reset()
    token = client.post("/api/auth/login", json={"username": "ra1", "password": "demo@123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Action requires step-up -> 403 STEP_UP_REQUIRED
    res1 = client.get("/api/test-privileged-action", headers=headers)
    assert res1.status_code == 403
    assert res1.json()["error"]["code"] == "STEP_UP_REQUIRED"

    # 2. Invalid PIN -> 422 VALIDATION_ERROR
    bad_pin = client.post("/api/auth/step-up", json={"pin": "000000"}, headers=headers)
    assert bad_pin.status_code == 422
    assert bad_pin.json()["error"]["code"] == "VALIDATION_ERROR"

    # 3. Valid PIN -> 200 OK
    good_pin = client.post("/api/auth/step-up", json={"pin": "246810"}, headers=headers)
    assert good_pin.status_code == 200
    assert good_pin.json()["status"] == "ok"

    # 4. Privileged action now succeeds
    res2 = client.get("/api/test-privileged-action", headers=headers)
    assert res2.status_code == 200
    assert res2.json()["step_up"] is True

    # 5. Advance clock by 6 minutes (TTL is 5 minutes)
    clock.advance(minutes=6)

    # 6. Action blocked again -> STEP_UP_REQUIRED
    res3 = client.get("/api/test-privileged-action", headers=headers)
    assert res3.status_code == 403
    assert res3.json()["error"]["code"] == "STEP_UP_REQUIRED"
    clock.reset()


def test_demo_users_endpoint():
    """Verify GET /demo/users behavior in demo and non-demo modes."""
    # 1. In demo mode
    os.environ["DEMO_MODE"] = "true"
    res = client.get("/api/demo/users")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 20
    assert any(u["username"] == "ar_sig" for u in items)

    # 2. When demo mode is disabled
    os.environ["DEMO_MODE"] = "false"
    res_disabled = client.get("/api/demo/users")
    assert res_disabled.status_code == 404
    assert res_disabled.json()["error"]["code"] == "NOT_FOUND"

    os.environ["DEMO_MODE"] = "true"
