import pytest
from app.core import clock, policy
from app.core.db import SessionLocal, create_tables, drop_tables
from app.core.models import Notification, User
from app.core.seed import seed as seed_core
from app.modules.bank import service
from app.modules.bank.ids import stable_id
from app.modules.bank.models import BankRequest
from app.modules.bank.seed import seed as seed_bank
from app.modules.bank.sla import bank_request_sla
from app.modules.intake.models import Discrepancy
from app.modules.intake.seed import seed as seed_intake
from app.modules.monitoring.seed import seed as seed_monitoring


@pytest.fixture(autouse=True)
def full_seed():
    offset = clock.get_offset()
    create_tables()
    seed_core(); seed_intake(); seed_bank(); seed_monitoring()
    yield
    drop_tables()
    clock.set_offset(offset)
    policy.reload_cache()


def setup_request():
    db = SessionLocal()
    try:
        actor = db.query(User).filter_by(username="so1").one()
        instrument_id = stable_id("instrument", "filler-01")
    finally:
        db.close()
    return service.create_request(instrument_id, actor, "SLA test request")


def tick():
    db = SessionLocal()
    try:
        result = bank_request_sla(db, clock.now())
        db.commit()
        return result
    finally:
        db.close()


def advance(days):
    clock.advance(days=days)
    return tick()


def count(request_id):
    db = SessionLocal()
    try:
        return db.query(Notification).filter(Notification.dedupe_key.like(f"bank_sla:{request_id}:%")).count()
    finally:
        db.close()


def test_sla_ladder_dedupes_and_times_out_then_allows_new_request():
    request = setup_request()
    advance(2); assert count(request.id) == 0
    advance(1); assert count(request.id) == 1
    advance(4); assert count(request.id) == 2
    advance(7)
    assert count(request.id) == 4
    db = SessionLocal()
    try:
        assert db.query(BankRequest).filter_by(id=request.id).one().state == "ESCALATED"
    finally: db.close()
    advance(7); assert count(request.id) == 5
    tick(); assert count(request.id) == 5
    advance(9)
    db = SessionLocal()
    try:
        assert db.query(BankRequest).filter_by(id=request.id).one().state == "TIMED_OUT"
        assert db.query(Discrepancy).filter_by(instrument_id=request.instrument_id, code="D-18").count() == 1
        actor = db.query(User).filter_by(username="ao1").one()
    finally: db.close()
    new_request = service.create_request(request.instrument_id, actor, "Retry after timeout")
    assert new_request.state == "NOTIFIED"


def test_jump_fires_checkpoints_once_and_maker_submission_stops_ladder():
    request = setup_request()
    advance(30)
    assert count(request.id) == 7
    tick(); assert count(request.id) == 7
    submitted = setup_request()
    db = SessionLocal()
    try:
        row = db.query(BankRequest).filter_by(id=submitted.id).one()
        row.state = "MAKER_SUBMITTED"
        db.commit()
    finally: db.close()
    advance(30)
    assert count(submitted.id) == 0


def test_policy_override_is_respected():
    request = setup_request()
    policy._policy_cache["bank_reminder_days"] = [1]
    policy._cache_initialized = True
    advance(1)
    assert count(request.id) == 1
