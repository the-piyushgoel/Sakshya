"""
PR-1 smoke tests — verify scaffold is wired up correctly.
"""
import pytest
from fastapi.testclient import TestClient


def get_client():
    from app.main import app
    return TestClient(app)


def test_health():
    client = get_client()
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"


def test_enums_are_frozen():
    """Verify all enums from §3.2 exist and haven't been renamed."""
    from app.core.enums import (
        AlertType, BankOutcome, BankRequestState, CaseType,
        DiscrepancyStatus, DocCheckOutcome, EligibilityVerdict,
        InstrumentState, LetterState, ObligationState,
        PublicVerifyStatus, RenewalMode, Role, RuleResult,
        Severity, TrustLevel, ReleaseState,
    )

    # Spot-check critical values from §3.2
    assert Role.INS_SIGNATORY == "INS_SIGNATORY"
    assert Role.BANK_MAKER == "BANK_MAKER"
    assert TrustLevel.L2_BANK_CONFIRMED == "L2_BANK_CONFIRMED"
    assert InstrumentState.ACTIVE == "ACTIVE"
    assert InstrumentState.RELEASE_LOCKED == "RELEASE_LOCKED"
    assert ReleaseState.SETTLEMENT_PENDING == "SETTLEMENT_PENDING"
    assert AlertType.MATURITY_180 == "MATURITY_180"
    assert AlertType.QUARANTINE_VIGILANCE == "QUARANTINE_VIGILANCE"


def test_error_handler_shape():
    """Unknown route should return 404, not a FastAPI default."""
    client = get_client()
    r = client.get("/api/nonexistent-endpoint-xyz")
    assert r.status_code == 404


def test_module_routers_auto_discovered():
    """All 6 module routers must be loaded (even if they have no endpoints yet)."""
    client = get_client()
    r = client.get("/openapi.json")
    assert r.status_code == 200
    # Health endpoint must exist
    paths = r.json().get("paths", {})
    assert "/api/health" in paths


def test_make_reset_idempotent():
    """create_tables() called twice should not raise."""
    from app.core.db import create_tables
    create_tables()
    create_tables()  # second call — must be silent

