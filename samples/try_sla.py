import sys

sys.path.insert(0, "backend")

"""Exercise the bank request SLA ladder against the seeded demo database."""
from pathlib import Path

from app.core.db import SessionLocal
from app.core.models import Notification
from app.main import app
from app.modules.bank.models import BankRequest
from app.modules.intake.models import Discrepancy
from fastapi.testclient import TestClient
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "samples" / "out" / "fdr_genuine_aryabhatta.pdf"
client = TestClient(app)
failed = False


def login(name):
    response = client.post("/api/auth/login", json={"username": name, "password": "demo@123"})
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def main():
    global failed
    admin = login("admin1")
    try:
        if not PDF.exists():
            raise FileNotFoundError(PDF)
        with SessionLocal() as db:
            obligation_id = db.execute(text("""
                SELECT obligation.id FROM obligation JOIN institute ON institute.id = obligation.institute_id
                WHERE institute.name LIKE 'Aryabhatta%'
            """)).scalar_one()
        headers = login("ao1")
        uploaded = client.post("/api/instruments", headers=login("ar_sig"),
                               files={"file": (PDF.name, PDF.read_bytes(), "application/pdf")},
                               data={"obligation_id": obligation_id, "fdr_number": "BRB-FDR-SLA-001",
                                     "bank_ifsc": "BRBK0001234", "principal_paise": "250000000",
                                     "issue_date": "2024-01-15", "maturity_date": "2027-01-15",
                                     "interest_rate_pct": "7.25", "holder_names": "Aryabhatta Trust"})
        if uploaded.status_code != 200:
            raise RuntimeError(f"sample upload HTTP {uploaded.status_code}: {uploaded.text}")
        instrument_id = uploaded.json()["id"]
        response = client.post("/api/bank-requests", headers=headers,
                               json={"instrument_id": instrument_id, "reason": "SLA sample check"})
        response.raise_for_status()
        request_id = response.json()["id"]
        total = 0
        for days in (3, 4, 7, 7, 9):
            advanced = client.post("/api/admin/clock/advance", headers=admin,
                                   json={"days": days, "run_tick": True})
            advanced.raise_for_status()
            jobs = advanced.json().get("jobs_run") or []
            sla_job = next((job for job in jobs if job.get("job_name") == "bank_request_sla"), {})
            if sla_job.get("status") == "FAILED":
                raise RuntimeError(sla_job.get("details"))
            with SessionLocal() as db:
                row = db.query(BankRequest).filter_by(id=request_id).one()
                notifications = db.query(Notification).filter(
                    Notification.dedupe_key.like(f"bank_sla:{request_id}:%")
                ).count()
                d18 = db.query(Discrepancy).filter_by(instrument_id=instrument_id, code="D-18").count()
            total += days
            print(f"{total} | {row.state} | {notifications} | {d18}")
            failed |= advanced.status_code != 200
        failed |= row.state != "TIMED_OUT" or d18 != 1
    except Exception as exc:  # noqa: BLE001
        failed = True
        print(f"SLA ERROR | {type(exc).__name__} | {exc}")
    finally:
        client.post("/api/admin/clock/reset", headers=admin)
    print("SLA FAILED" if failed else "SLA OK")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
