"""
Unit tests for Public verification stub router (§3.5).
"""
from fastapi.testclient import TestClient

from app.core.enums import PublicVerifyStatus
from app.main import app

client = TestClient(app)


def test_public_verify_post_valid():
    """Verify POST /api/public/verify succeeds without authentication for valid details."""
    res = client.post(
        "/api/public/verify",
        json={
            "code": "SAK-2026-ARYA-8841",
            "fdr_number": "FDR-ARYA-401928",
            "ifsc": "BRBK0001234",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == PublicVerifyStatus.VALID.value
    assert data["principal_paise"] == 450000000
    assert data["destination_account"]["account_number"] == "99990000123456"
    assert data["tamper_warning"] is False


def test_public_verify_post_invalid():
    """Verify POST /api/public/verify returns 404 for unrecognized certificate code."""
    res = client.post(
        "/api/public/verify",
        json={
            "code": "INVALID-CODE-9999",
            "fdr_number": "FDR-NONE-000",
            "ifsc": "SBIN0000001",
        },
    )
    assert res.status_code == 404
    data = res.json()
    assert "error" in data


def test_public_verify_qr_landing_valid():
    """Verify GET /api/public/verify/{code} returns valid verification result."""
    res = client.get("/api/public/verify/SAK-2026-ARYA-8841")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == PublicVerifyStatus.VALID.value
    assert data["tamper_warning"] is False


def test_public_verify_qr_landing_tampered_hash():
    """Verify GET /api/public/verify/{code}?h=... flags TAMPERED when hash mismatch occurs."""
    tampered_hash = "0000000000000000000000000000000000000000000000000000000000000000"
    res = client.get(f"/api/public/verify/SAK-2026-ARYA-8841?h={tampered_hash}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == PublicVerifyStatus.TAMPERED.value
    assert data["tamper_warning"] is True

