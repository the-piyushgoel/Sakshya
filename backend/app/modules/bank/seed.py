"""Deterministic seed data for bank-owned tables."""
from datetime import date, datetime, timedelta

from app.core.db import SessionLocal
from app.core.enums import BankOutcome, BankRequestState

from .ids import bank_id, stable_id
from .models import Bank, BankChecklistItem, BankNodalContact, BankRequest


def _today() -> date:
    try:
        from app.core.clock import now
        return now().date()
    except (ImportError, AttributeError):
        # TODO: switch to the shared clock once the core clock module exists.
        return date(2026, 10, 24)


def _dt(day: date) -> datetime:
    return datetime.combine(day, datetime.min.time())


def seed() -> None:
    session = SessionLocal()
    try:
        if session.query(Bank).count():
            return
        today = _today()
        banks = [("BRB", "Bharat Reserve Bank", "BRBK"), ("HCB", "Hindustan Commercial Bank", "HCBK"),
                 ("SCB", "Sarvodaya Co-op Bank", "SCBK")]
        for code, name, prefix in banks:
            bank = Bank(id=bank_id(code), code=code, name=name, ifsc_prefix=prefix)
            session.add(bank)
            for number in (1, 2):
                session.add(BankNodalContact(id=stable_id("contact", f"{code}:{number}"), bank_id=bank.id,
                                             name=f"{name} Nodal {number}", designation="Nodal Officer",
                                             email=f"{code.lower()}.nodal{number}@example.test", phone=f"+91-90000{number:05d}"))
        # Requests are deliberately seeded after intake and reference its stable IDs without cross-module FKs.
        requests = [
            ("vidyajyoti", "BRB", BankRequestState.CONFIRMED.value, BankOutcome.ALL_CLEAR.value, today - timedelta(days=45)),
            ("filler-02", "BRB", BankRequestState.NOTIFIED.value, None, today),
        ]
        for slug, code, state, outcome, created in requests:
            rid = stable_id("bank-request", slug)
            session.add(BankRequest(id=rid, instrument_id=stable_id("instrument", slug), bank_id=bank_id(code),
                                    state=state, outcome=outcome, reason="Seed verification", directory_contact_id=stable_id("contact", f"{code}:1"),
                                    created_by=stable_id("user", "seed"), maker_id=stable_id("user", "bank-maker"),
                                    checker_id=stable_id("user", "bank-checker") if outcome else None, remarks="seed v0",
                                    created_at=_dt(created), notified_at=_dt(created), acknowledged_at=_dt(created) if outcome else None,
                                    responded_at=_dt(created) if outcome else None))
            for item_no in range(1, 13):
                session.add(BankChecklistItem(id=stable_id("checklist", f"{slug}:{item_no}"), request_id=rid,
                                              item_no=item_no, question=f"Bank verification item {item_no}", answer=True if outcome else None,
                                              remarks=None))
        session.commit()
    finally:
        session.close()
