import sys

sys.path.insert(0, "backend")

from datetime import UTC, datetime
from pathlib import Path

from app.core import clock
from app.core.db import engine
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
GENUINE = ROOT / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
RENEWAL = ROOT / "samples" / "out" / "fdr_renewal_aryabhatta.pdf"
client = TestClient(app)
failed = False


def login(username):
    response = client.post("/api/auth/login", json={"username": username, "password": "demo@123"})
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def report(step, actor, response, expected_status, expected):
    global failed
    body = response.json()
    actual = body.get("state") or body.get("error", {}).get("code") or expected
    ok = response.status_code == expected_status and actual == expected
    print(f"{step} | {actor} | HTTP {response.status_code} | {actual}")
    if not ok:
        print(f"  expected HTTP {expected_status} | {expected}")
        if body.get("error"):
            print(f"  details | {body['error']}")
        failed = True
    return body


def confirm_bank(instrument_id, ao):
    response = client.post("/api/bank-requests", headers=ao,
                           json={"instrument_id": instrument_id, "reason": "Renewal verification"})
    request_id = report("bank request", "ao1", response, 200, "NOTIFIED").get("id")
    if not request_id:
        return
    maker = login("brb_mk")
    checklist = [{"item_no": n, "question": f"Renewal check {n}", "answer": True, "remarks": "Verified"}
                 for n in range(1, 13)]
    response = client.post(f"/api/bank/requests/{request_id}/maker-submit", headers=maker,
                           json={"checklist": checklist, "outcome": "ALL_CLEAR", "remarks": "Verified"})
    report("maker confirm", "brb_mk", response, 200, "MAKER_SUBMITTED")
    response = client.post(f"/api/bank/requests/{request_id}/checker-decision", headers=login("brb_ck"),
                           json={"decision": "AUTHORISE", "remarks": "Authorised"})
    report("checker confirm", "brb_ck", response, 200, "CONFIRMED")


def main():
    global failed
    original_offset = clock.get_offset()
    try:
        target_issue_date = datetime(2027, 1, 16, tzinfo=UTC)
        delta = max(0, (target_issue_date - clock.now()).total_seconds())
        if delta:
            clock.advance(seconds=int(delta))
        if not GENUINE.exists() or not RENEWAL.exists():
            raise FileNotFoundError("Run samples/generate_samples.py first")
        with engine.connect() as connection:
            obligation_id = connection.execute(text(
                "SELECT obligation.id FROM obligation JOIN institute ON institute.id=obligation.institute_id "
                "WHERE institute.name LIKE 'Aryabhatta%'"
            )).scalar_one()

        ar_sig = login("ar_sig")
        ao1 = login("ao1")
        ao2 = login("ao2")
        response = client.post(
            "/api/instruments", headers=ar_sig,
            files={"file": (GENUINE.name, GENUINE.read_bytes(), "application/pdf")},
            data={"obligation_id": obligation_id, "fdr_number": "BRB-FDR-2024-000101",
                  "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
                  "issue_date": "2024-01-15", "maturity_date": "2027-01-15",
                  "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust"},
        )
        predecessor_id = report("submit genuine", "ar_sig", response, 200, "SCRUTINY").get("id")
        if not predecessor_id:
            raise RuntimeError("Genuine sample submission failed")

        confirm_bank(predecessor_id, ao1)
        client.post("/api/auth/step-up", headers=ao2, json={"pin": "246810"})
        response = client.post(f"/api/instruments/{predecessor_id}/activate", headers=ao2)
        report("activate genuine", "ao2", response, 200, "ACTIVE")
        report("initial obligation", "ao2", client.get(f"/api/obligations/{obligation_id}", headers=ao2), 200, "COVERED")

        response = client.post(
            f"/api/instruments/{predecessor_id}/renew", headers=ar_sig,
            files={"file": (RENEWAL.name, RENEWAL.read_bytes(), "application/pdf")},
            data={"mode": "NEW_NUMBER", "fdr_number": "BRB-FDR-2027-000202",
                  "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
                  "issue_date": "2027-01-16", "maturity_date": "2030-01-15",
                  "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust"},
        )
        successor_id = report("renew", "ar_sig", response, 200, "SCRUTINY").get("id")
        if not successor_id:
            raise RuntimeError("Renewal submission failed")
        report("coverage retained", "ar_sig", client.get(f"/api/obligations/{obligation_id}", headers=ar_sig), 200, "COVERED")
        confirm_bank(successor_id, ao1)

        client.post("/api/auth/step-up", headers=ao1, json={"pin": "246810"})
        response = client.post(f"/api/instruments/{successor_id}/activate", headers=ao1)
        report("ao1 activation", "ao1", response, 403, "SOD_VIOLATION")
        client.post("/api/auth/step-up", headers=ao2, json={"pin": "246810"})
        response = client.post(f"/api/instruments/{successor_id}/activate", headers=ao2)
        report("ao2 activation", "ao2", response, 200, "ACTIVE")
        response = client.get(f"/api/instruments/{predecessor_id}", headers=ao2)
        report("predecessor", "ao2", response, 200, "SUPERSEDED")
        report("obligation", "ao2", client.get(f"/api/obligations/{obligation_id}", headers=ao2), 200, "COVERED")
        timeline = client.get(f"/api/instruments/{successor_id}/timeline", headers=ao2)
        body = timeline.json()
        rows = body if isinstance(body, list) else body.get("items", body.get("events", []))
        result = "HAS_HISTORY" if timeline.status_code == 200 and rows else "NO_HISTORY"
        ok = timeline.status_code == 200 and bool(rows)
        print(f"timeline | ao2 | HTTP {timeline.status_code} | {result}")
        failed |= not ok
    except Exception as exc:  # noqa: BLE001
        failed = True
        print(f"FLOW ERROR | {type(exc).__name__} | {exc}")
    finally:
        clock.set_offset(original_offset)
    print("RENEWAL FAILED" if failed else "RENEWAL OK")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
