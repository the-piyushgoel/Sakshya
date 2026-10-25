import sys

sys.path.insert(0, "backend")

"""Exercise intake submission cases against the already seeded local database."""
from pathlib import Path

from app.core.db import engine
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples" / "out"
client = TestClient(app)


def main() -> None:
    with engine.connect() as connection:
        aryabhatta_obligation_id = connection.execute(text("""
            SELECT obligation.id FROM obligation
            JOIN institute ON institute.id = obligation.institute_id
            WHERE institute.name LIKE 'Aryabhatta%'
        """)).scalar_one()
        nalanda_obligation_id = connection.execute(text("""
            SELECT obligation.id FROM obligation
            JOIN institute ON institute.id = obligation.institute_id
            WHERE institute.name LIKE 'Nalanda%'
        """)).scalar_one()
    cases = [
        ("genuine", "ar_sig", "fdr_genuine_aryabhatta.pdf", "BRB-FDR-2024-000101", aryabhatta_obligation_id),
        ("tampered", "ar_sig", "fdr_tampered_amount.pdf", "FDR-TAMPER-123", aryabhatta_obligation_id),
        ("duplicate", "na_sig", "fdr_duplicate_vidyajyoti.pdf", "BRB-FDR-2021-004711", nalanda_obligation_id),
        ("non-PDF", "ar_sig", None, "FDR-BAD-123", aryabhatta_obligation_id),
    ]
    for scenario, username, filename, fdr, obligation_id in cases:
        login = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
        login.raise_for_status()
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        content = (SAMPLES / filename).read_bytes() if filename else b"not a pdf"
        response = client.post(
            "/api/instruments", headers=headers,
            files={"file": (filename or "bad.pdf", content, "application/pdf")},
            data={"obligation_id": obligation_id, "fdr_number": fdr,
                  "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
                  "issue_date": "2024-01-15", "maturity_date": "2027-01-15",
                  "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust; Aryabhatta Education Society"},
        )
        body = response.json()
        state = body.get("state", "-")
        discrepancies = ",".join(item["code"] for item in body.get("discrepancies", [])) or "-"
        print(f"{scenario} | {response.status_code} | {state} | {discrepancies} | {len(body.get('fields', []))}")


if __name__ == "__main__":
    main()
