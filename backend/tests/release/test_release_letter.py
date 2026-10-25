"""
Comprehensive unit and integration tests for PR-7 Release Letter Engine.

Covers:
- Step-Up PIN enforcement on signing
- Ed25519 digital signature and RFC 8785 canonical JSON integrity
- ReportLab PDF streaming and dynamic QR code generation
- OpenCV QR decoding and URL validation
- Letter revocation lifecycle
- Automated 14-day expiry job via clock time travel
- Public verification integration with real database letters
- Multi-tenant institute scoping
"""
from datetime import timedelta
import cv2
import fitz
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core import clock
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.enums import LetterState, PublicVerifyStatus, ReleaseState, Role
from app.core.seed import seed as seed_core
from app.main import app
from app.modules.bank.seed import seed as seed_bank
from app.modules.intake.ids import stable_id
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring
from app.modules.release import service as release_service
from app.modules.release.crypto import compute_canonical_hash, signer
from app.modules.release.models import ReleaseLetter, ReleaseRequest
from app.modules.release.seed import seed as seed_release

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_db():
    drop_tables()
    create_tables()
    clock.reset()
    seed_core()
    seed_intake()
    seed_bank()
    seed_monitoring()
    seed_release()
    yield
    drop_tables()
    clock.reset()


def get_token(username: str) -> str:
    res = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    return res.json()["access_token"]


def auth(username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token(username)}"}


def _setup_recommended_request() -> str:
    """Helper: Submits and recommends Vidya Jyoti release request."""
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={
            "obligation_id": ob_id,
            "instrument_ids": [ins_id],
            "case_type": "TERM_COMPLETE",
            "remarks": "10-year term complete",
        },
    )
    assert res.status_code == 200
    req_id = res.json()["id"]

    ao_headers = auth("ao1")
    res_rec = client.post(
        f"/api/release/requests/{req_id}/recommend",
        headers=ao_headers,
        json={"recommendation_note": "FDR maturity verified clear."},
    )
    assert res_rec.status_code == 200
    assert res_rec.json()["state"] == ReleaseState.RECOMMENDED.value
    return req_id


# ── Step-up & Role Enforcement ───────────────────────────────────────────────

def test_sign_release_request_step_up_enforcement():
    """Signing without 6-digit PIN step-up must return 403 STEP_UP_REQUIRED."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")

    # 1. Attempt to sign without step-up
    res_blocked = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    assert res_blocked.status_code == 403
    assert res_blocked.json()["error"]["code"] == "STEP_UP_REQUIRED"

    # 2. Complete step-up with PIN 246810
    res_step = client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})
    assert res_step.status_code == 200

    # 3. Signing now succeeds
    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    assert res_sign.status_code == 200
    data = res_sign.json()
    assert data["status"] == "SIGNED"
    assert data["request_id"] == req_id
    assert "letter_id" in data
    assert "verification_code" in data
    assert "letter_hash" in data


def test_sign_release_request_role_guard():
    """Non-RA roles (e.g., INS_SIGNATORY or SCRUTINY_OFFICER) cannot sign."""
    req_id = _setup_recommended_request()
    vj_headers = auth("vj_sig")

    res = client.post(f"/api/release/requests/{req_id}/sign", headers=vj_headers)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"


def test_sign_release_request_invalid_state():
    """Cannot sign a request that has not been recommended."""
    vj_headers = auth("vj_sig")
    ob_id = stable_id("obligation", "vidyajyoti")
    ins_id = stable_id("instrument", "vidyajyoti")

    res = client.post(
        "/api/release/requests",
        headers=vj_headers,
        json={"obligation_id": ob_id, "instrument_ids": [ins_id], "case_type": "TERM_COMPLETE"},
    )
    req_id = res.json()["id"]

    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    # Attempt to sign request while still in SCRUTINY
    res_err = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    assert res_err.status_code == 409
    assert res_err.json()["error"]["code"] == "INVALID_STATE"


# ── Golden Path: Signing, Integrity, and DB State ────────────────────────────

def test_sign_release_request_golden_path_and_db_state():
    """Full lifecycle: sign request, verify DB persistence, settlement, and audit."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    assert res.status_code == 200
    sign_data = res.json()
    letter_id = sign_data["letter_id"]

    db = SessionLocal()
    try:
        req = db.query(ReleaseRequest).filter(ReleaseRequest.id == req_id).first()
        assert req.state == ReleaseState.APPROVED.value
        assert req.letter_id == letter_id

        letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
        assert letter is not None
        assert letter.state == LetterState.ISSUED.value
        assert letter.principal_paise == 450000000
        assert letter.principal_to_trust_paise == 450000000
        assert letter.aicte_share_paise == 0
        assert letter.verification_code.startswith("SAK-2026-")
        assert len(letter.signature_hex) == 128
        assert letter.signer_key_id == "key-ra1-ed25519"
        assert letter.destination_account_json["account_number"] == "99990000123456"

        # Cryptographic verification
        assert signer.verify_digest(letter.letter_hash, letter.signature_hex) is True
    finally:
        db.close()


def test_cryptographic_tamper_detection():
    """Tampering with any field in the canonical payload invalidates signature."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    letter_id = res.json()["letter_id"]

    db = SessionLocal()
    try:
        letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
        # Genuine signature verifies
        assert signer.verify_digest(letter.letter_hash, letter.signature_hex) is True

        # Tampered amount in payload yields different digest
        tampered_payload = dict(letter.canonical_payload_json)
        tampered_payload["principal_to_trust"] = {"amount_paise": 999999999}
        _, tampered_digest = compute_canonical_hash(tampered_payload)

        # Signature must fail on tampered digest
        assert signer.verify_digest(tampered_digest, letter.signature_hex) is False
    finally:
        db.close()


# ── PDF Generation & QR Verification ─────────────────────────────────────────

def test_release_letter_pdf_stream_and_qr_decoding():
    """Download PDF, verify formatting, and decode QR code using OpenCV."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    letter_id = res_sign.json()["letter_id"]
    code = res_sign.json()["verification_code"]
    letter_hash = res_sign.json()["letter_hash"]

    # Download binary PDF
    res_pdf = client.get(f"/api/release/letters/{letter_id}/pdf", headers=ra_headers)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")

    # Render PDF page to image and decode QR using PyMuPDF and OpenCV
    pdf_doc = fitz.open(stream=res_pdf.content, filetype="pdf")
    pix = pdf_doc[0].get_pixmap()
    img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGR)
    else:
        img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    detector = cv2.QRCodeDetector()
    decoded_url, _, _ = detector.detectAndDecode(img_np)
    assert decoded_url, "Failed to decode QR code from generated PDF!"
    assert f"/verify/{code}?h={letter_hash[:8]}" in decoded_url


# ── Letter Revocation ────────────────────────────────────────────────────────

def test_revoke_release_letter():
    """Release Authority revokes letter prior to execution."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    letter_id = res_sign.json()["letter_id"]

    # Revoke letter
    res_rev = client.post(
        f"/api/release/letters/{letter_id}/revoke",
        headers=ra_headers,
        json={"reason": "Court injunction on trust assets"},
    )
    assert res_rev.status_code == 200
    rev_data = res_rev.json()
    assert rev_data["state"] == LetterState.REVOKED.value
    assert rev_data["revoke_reason"] == "Court injunction on trust assets"

    # Attempting to revoke again fails
    res_re_rev = client.post(
        f"/api/release/letters/{letter_id}/revoke",
        headers=ra_headers,
        json={"reason": "Duplicate revocation"},
    )
    assert res_re_rev.status_code == 409
    assert res_re_rev.json()["error"]["code"] == "INVALID_STATE"


# ── Letter Expiry Job via Time Travel ────────────────────────────────────────

def test_letter_expiry_job_via_time_travel():
    """Advancing clock by 15 days triggers letter_expiry job, setting state to EXPIRED."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    letter_id = res_sign.json()["letter_id"]
    code = res_sign.json()["verification_code"]

    # Advance clock by 15 days (letter validity is 14 days)
    admin_headers = auth("admin1")
    res_adv = client.post(
        "/api/admin/clock/advance",
        headers=admin_headers,
        json={"days": 15, "run_tick": True},
    )
    assert res_adv.status_code == 200

    # Letter should now be EXPIRED
    db = SessionLocal()
    try:
        letter = db.query(ReleaseLetter).filter(ReleaseLetter.id == letter_id).first()
        assert letter.state == LetterState.EXPIRED.value
    finally:
        db.close()

    # Public verification confirms EXPIRED
    res_verify = client.get(f"/api/public/verify/{code}")
    assert res_verify.status_code == 200
    assert res_verify.json()["status"] == PublicVerifyStatus.EXPIRED.value


# ── Public Verification Integration ──────────────────────────────────────────

def test_public_verify_real_database_letter():
    """Verify live database letters through /api/public/verify and detect tampering."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    code = res_sign.json()["verification_code"]
    letter_hash = res_sign.json()["letter_hash"]

    # 1. QR landing with valid hash fragment
    res_qr = client.get(f"/api/public/verify/{code}?h={letter_hash[:8]}")
    assert res_qr.status_code == 200
    assert res_qr.json()["status"] == PublicVerifyStatus.VALID.value
    assert res_qr.json()["tamper_warning"] is False

    # 2. QR landing with tampered hash fragment
    res_tamper = client.get(f"/api/public/verify/{code}?h=badhash8")
    assert res_tamper.status_code == 200
    assert res_tamper.json()["status"] == PublicVerifyStatus.TAMPERED.value
    assert res_tamper.json()["tamper_warning"] is True

    # 3. Form verification with matching FDR number and IFSC
    ins_id = stable_id("instrument", "vidyajyoti")
    db = SessionLocal()
    try:
        from app.modules.intake import service as intake_service
        ins = intake_service.get_instrument(ins_id, db)
        fdr_num = intake_service.get_field_value(ins, "fdr_number", db)
        ifsc = intake_service.get_field_value(ins, "bank_ifsc", db)
    finally:
        db.close()

    res_post = client.post(
        "/api/public/verify",
        json={"code": code, "fdr_number": fdr_num, "ifsc": ifsc},
    )
    assert res_post.status_code == 200
    assert res_post.json()["status"] == PublicVerifyStatus.VALID.value


# ── Multi-Tenant Isolation ───────────────────────────────────────────────────

def test_release_letter_tenant_scoping():
    """Institute signatories can only access letters for their own institute."""
    req_id = _setup_recommended_request()
    ra_headers = auth("ra1")
    client.post("/api/auth/step-up", headers=ra_headers, json={"pin": "246810"})

    res_sign = client.post(f"/api/release/requests/{req_id}/sign", headers=ra_headers)
    letter_id = res_sign.json()["letter_id"]

    # Vidya Jyoti signatory can access
    vj_headers = auth("vj_sig")
    res_vj = client.get(f"/api/release/letters/{letter_id}", headers=vj_headers)
    assert res_vj.status_code == 200

    # Aryabhatta signatory cannot access (returns 404)
    ar_headers = auth("ar_sig")
    res_ar = client.get(f"/api/release/letters/{letter_id}", headers=ar_headers)
    assert res_ar.status_code == 404
