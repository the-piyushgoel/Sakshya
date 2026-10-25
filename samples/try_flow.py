import sys

sys.path.insert(0, "backend")

"""Run the PY-5a instrument activation golden path against the seeded database."""
from pathlib import Path

from app.core.db import engine
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
client = TestClient(app)
failed = False


def login(username):
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def report(step, actor, response, expected_status, expected_result):
    global failed
    body = response.json()
    result = body.get("state") or body.get("error", {}).get("code") or expected_result
    passed = response.status_code == expected_status and result == expected_result
    print(f"{step} | {actor} | HTTP {response.status_code} | {result}")
    if not passed:
        failed = True
        print(f"  expected HTTP {expected_status} | {expected_result}")
    return body


def main():
    global failed
    try:
        with engine.connect() as connection:
            obligation_id = connection.execute(text("""
                SELECT obligation.id FROM obligation JOIN institute ON institute.id = obligation.institute_id
                WHERE institute.name LIKE 'Aryabhatta%'
            """)).scalar_one()

        signatory = login("ar_sig")
        response = client.post(
            "/api/instruments", headers=signatory,
            files={"file": (PDF.name, PDF.read_bytes(), "application/pdf")},
            data={"obligation_id": obligation_id, "fdr_number": "BRB-FDR-2024-000101",
                  "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
                  "issue_date": "2024-01-15", "maturity_date": "2027-01-15",
                  "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust"},
        )
        instrument_id = report(1, "ar_sig", response, 200, "SCRUTINY")["id"]

        ao1 = login("ao1")
        response = client.post("/api/bank-requests", headers=ao1,
                               json={"instrument_id": instrument_id, "reason": "Verify FDR for activation"})
        request_id = report(2, "ao1", response, 200, "NOTIFIED")["id"]

        maker = login("brb_mk")
        client.get(f"/api/bank/requests/{request_id}", headers=maker)
        checklist = [{"item_no": n, "question": f"PY-4 check {n}", "answer": True, "remarks": "Verified"}
                     for n in range(1, 13)]
        response = client.post(f"/api/bank/requests/{request_id}/maker-submit", headers=maker,
                               json={"checklist": checklist, "outcome": "ALL_CLEAR", "remarks": "Verified"})
        report(3, "brb_mk", response, 200, "MAKER_SUBMITTED")

        response = client.post(f"/api/bank/requests/{request_id}/checker-decision", headers=login("brb_ck"),
                               json={"decision": "AUTHORISE", "remarks": "Authorised"})
        report(4, "brb_ck", response, 200, "CONFIRMED")

        detail = client.get(f"/api/instruments/{instrument_id}", headers=ao1)
        fields = {item["name"]: item for item in detail.json().get("fields", [])}
        required = ("principal_paise", "maturity_date", "favouring", "lien_marked")
        values_ok = all(fields.get(name, {}).get("trust") == "L2_BANK_CONFIRMED" for name in required)
        result = "L2_BANK_CONFIRMED" if values_ok else "MISSING_L2"
        print(f"5 | ao1 | HTTP {detail.status_code} | {result}")
        failed |= detail.status_code != 200 or not values_ok

        client.post("/api/auth/step-up", headers=ao1, json={"pin": "246810"})
        response = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao1)
        report(6, "ao1", response, 403, "SOD_VIOLATION")

        ao2 = login("ao2")
        with engine.begin() as connection:
            connection.execute(text("UPDATE users SET step_up_until = NULL WHERE username = 'ao2'"))
        response = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
        report(7, "ao2", response, 403, "STEP_UP_REQUIRED")

        client.post("/api/auth/step-up", headers=ao2, json={"pin": "246810"})
        response = client.post(f"/api/instruments/{instrument_id}/activate", headers=ao2)
        obligation = client.get(f"/api/obligations/{obligation_id}", headers=ao2)
        result = f"{response.json().get('state')} + {obligation.json().get('state')}"
        passed = response.status_code == 200 and response.json().get("state") == "ACTIVE"
        passed = passed and obligation.status_code == 200 and obligation.json().get("state") == "COVERED"
        print(f"8 | ao2 | HTTP {response.status_code}/{obligation.status_code} | {result}")
        failed |= not passed

        print("9 | brb_mk | SKIP | no seeded user has both bank maker and checker roles")
    except Exception as exc:  # noqa: BLE001
        failed = True
        print(f"FLOW ERROR | {type(exc).__name__} | {exc}")
    print("FLOW FAILED" if failed else "FLOW OK")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
