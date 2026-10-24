import hashlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.db import SessionLocal, create_tables, drop_tables
from app.modules.bank.models import Bank, BankRequest
from app.modules.bank.seed import seed as seed_banks
from app.modules.intake.models import (
    FieldTrust,
    Institute,
    Instrument,
    Obligation,
)
from app.modules.intake.seed import seed as seed_intake


@pytest.fixture(scope="module", autouse=True)
def tables():
    create_tables()
    yield
    drop_tables()


def test_seed_is_idempotent_and_has_required_data():
    seed_intake()
    seed_banks()
    session = SessionLocal()
    try:
        counts = {table: session.query(model).count() for table, model in (
            ("institutes", Institute), ("obligations", Obligation), ("instruments", Instrument),
            ("fields", FieldTrust), ("banks", Bank), ("requests", BankRequest))}
        seed_intake()
        seed_banks()
        assert counts == {table: session.query(model).count() for table, model in (
            ("institutes", Institute), ("obligations", Obligation), ("instruments", Instrument),
            ("fields", FieldTrust), ("banks", Bank), ("requests", BankRequest))}
        assert {row.code for row in session.query(Institute).all()} >= {"ARYABHATTA", "NALANDA", "TAKSHASHILA", "VIDYAJYOTI", "LOTHAL"}
        assert session.query(Instrument).count() >= 19
        assert len({row.fdr_fingerprint for row in session.query(Instrument).all()}) == session.query(Instrument).count()
        assert all(row.obligation_id and row.bank_id for row in session.query(Instrument).all())
    finally:
        session.close()


def test_seed_ids_are_stable():
    session = SessionLocal()
    try:
        first = [(row.id, row.fdr_fingerprint) for row in session.query(Instrument).order_by(Instrument.id)]
    finally:
        session.close()
    assert hashlib.sha256(repr(first).encode()).hexdigest()
