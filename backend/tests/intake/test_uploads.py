from pathlib import Path

import pytest
from app.core import clock
from app.core.db import create_tables, drop_tables
from app.core.seed import seed as seed_core
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
SAMPLES = Path(__file__).resolve().parents[3] / "samples" / "out"


@pytest.fixture(autouse=True)
def setup_db():
    create_tables()
    seed_core()
    yield
    drop_tables()
    clock.reset()


def token(username: str) -> str:
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert response.status_code == 200
    return response.json()["access_token"]


def upload(path: Path, headers: dict[str, str]):
    return client.post(
        "/api/documents/preview",
        files={"file": (path.name, path.read_bytes(), "application/pdf")},
        headers=headers,
    )


def test_preview_genuine_and_tampered_samples():
    headers = {"Authorization": f"Bearer {token('ar_sig')}"}
    genuine = upload(SAMPLES / "fdr_genuine_aryabhatta.pdf", headers)
    assert genuine.status_code == 200, genuine.text
    assert len(genuine.json()["extracted"]) >= 7
    assert genuine.json()["flags"] == []

    tampered = upload(SAMPLES / "fdr_tampered_amount.pdf", headers)
    assert tampered.status_code == 200, tampered.text
    assert "D-11" in tampered.json()["flags"]


def test_preview_rejects_invalid_and_oversized_uploads():
    headers = {"Authorization": f"Bearer {token('ar_sig')}"}
    wrong_type = client.post(
        "/api/documents/preview",
        files={"file": ("looks-like.pdf", b"not a pdf", "application/pdf")},
        headers=headers,
    )
    assert wrong_type.status_code == 422
    assert wrong_type.json()["error"]["code"] == "VALIDATION_ERROR"

    too_large = client.post(
        "/api/documents/preview",
        files={"file": ("large.pdf", b"%PDF-" + b"x" * (16 * 1024 * 1024), "application/pdf")},
        headers=headers,
    )
    assert too_large.status_code == 422
    assert too_large.json()["error"]["code"] == "VALIDATION_ERROR"


def test_preview_requires_authentication():
    response = client.post(
        "/api/documents/preview",
        files={"file": ("sample.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"
