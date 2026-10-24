"""Deterministic seed data for intake-owned tables."""
import random
from datetime import date, datetime, timedelta

from app.core.db import SessionLocal
from app.core.enums import (
    DiscrepancyStatus,
    InstrumentState,
    ObligationState,
    Severity,
    TrustLevel,
)

from .ids import bank_id, institute_id, stable_id
from .models import (
    Discrepancy,
    FieldTrust,
    Institute,
    Instrument,
    InstrumentStateHistory,
    InstrumentVersion,
    Obligation,
    Trust,
)
from .security import fingerprint


def _today() -> date:
    try:
        from app.core.clock import now
        return now().date()
    except (ImportError, AttributeError):
        # TODO: switch to the shared clock once the core clock module exists.
        return date(2026, 10, 24)


def _dt(day: date) -> datetime:
    return datetime.combine(day, datetime.min.time())


def _field(session, instrument, name, value, day, trust=TrustLevel.L2_BANK_CONFIRMED.value):
    session.add(FieldTrust(id=stable_id("field", f"{instrument.id}:{name}"), instrument_id=instrument.id,
                           field_name=name, value=str(value), trust=trust, source="SEED",
                           set_at=_dt(day)))


def _instrument(session, obligation, slug, bank_code, state, day, fdr, maturity, amount=450000000,
                trust=TrustLevel.L2_BANK_CONFIRMED.value, discrepancy=None):
    iid = stable_id("instrument", slug)
    ins = Instrument(id=iid, obligation_id=obligation.id, institute_id=obligation.institute_id,
                     bank_id=bank_id(bank_code), state=state, is_quarantined=False,
                     fdr_fingerprint=fingerprint(fdr, bank_id(bank_code)), created_by=stable_id("user", "seed"), created_at=_dt(day))
    session.add(ins)
    fields = {"fdr_number": fdr, "bank_ifsc": f"{bank_code}K0001234", "principal_paise": amount,
              "issue_date": day - timedelta(days=365), "maturity_date": maturity,
              "interest_rate_pct": "7.25", "favouring": "Member Secretary, AICTE",
              "holder_names": "Aryabhatta Trust", "lien_marked": "true", "lien_ref": "LIEN-SEED",
              "accrued_interest_paise": 0}
    for name, value in fields.items():
        _field(session, ins, name, value, day, trust)
    session.add(InstrumentVersion(id=stable_id("version", slug), instrument_id=iid, version_no=1,
                                  fields_json={k: str(v) for k, v in fields.items()}, document_id=None, created_at=_dt(day)))
    session.add(InstrumentStateHistory(id=stable_id("history", slug), instrument_id=iid,
                                       from_state=None, to_state=state, actor_id=stable_id("user", "seed"),
                                       reason="seed v0", at=_dt(day)))
    if discrepancy:
        code, severity = discrepancy
        session.add(Discrepancy(id=stable_id("discrepancy", slug), instrument_id=iid, code=code,
                                severity=severity, status=DiscrepancyStatus.OPEN.value,
                                details_json={"source": "seed"}, created_at=_dt(day)))
    return ins


def seed() -> None:
    session = SessionLocal()
    try:
        if session.query(Institute).count():
            return
        today = _today()
        # Amounts are illustrative placeholders for the prototype seed.
        named = [
            ("aryabhatta", "Aryabhatta College of Engineering", "Aryabhatta Trust", ObligationState.PENDING_DEPOSIT.value),
            ("nalanda", "Nalanda Technical Campus", "Nalanda Trust", ObligationState.PENDING_DEPOSIT.value),
            ("takshashila", "Takshashila Institute of Management", "Takshashila Trust", ObligationState.COVERED.value),
            ("vidyajyoti", "Vidya Jyoti Institute of Technology", "Vidya Jyoti Trust", ObligationState.TERM_COMPLETE.value),
            ("lothal", "Lothal Institute of Technology", "Lothal Trust", ObligationState.COVERED.value),
        ]
        rows = []
        for slug, name, trust_name, state in named:
            institute = Institute(id=institute_id(slug), name=name, code=slug.upper(), city="New Delhi")
            trust = Trust(id=stable_id("trust", slug), institute_id=institute.id, name=trust_name)
            obligation = Obligation(id=stable_id("obligation", slug), institute_id=institute.id, trust_id=trust.id,
                                    programme="AICTE FDR obligation", required_paise=450000000, term_years=10,
                                    start_date=today - timedelta(days=365), end_date=today + timedelta(days=3650), state=state)
            session.add_all([institute, trust, obligation])
            rows.append((slug, obligation))
        for slug, obligation in rows:
            if slug == "takshashila":
                _instrument(session, obligation, slug, "BRB", InstrumentState.ACTIVE.value, today,
                            "BRB-FDR-2024-001001", today + timedelta(days=200))
            elif slug == "vidyajyoti":
                old = today - timedelta(days=45)
                _instrument(session, obligation, slug, "BRB", InstrumentState.MATURED.value, old,
                            "BRB-FDR-2021-004711", old + timedelta(days=1095))
            elif slug == "lothal":
                _instrument(session, obligation, slug, "HCB", InstrumentState.ACTIVE.value, today,
                            "HCB-FDR-2024-001002", today + timedelta(days=40))
        # One pending inbox instrument and deterministic mixed-state fillers.
        filler = random.Random(42)
        states = [InstrumentState.ACTIVE.value, InstrumentState.SCRUTINY.value,
                  InstrumentState.BANK_PENDING.value, InstrumentState.DISCREPANCY.value]
        for index in range(16):
            slug = f"filler-{index:02d}"
            institute = Institute(id=institute_id(slug), name=f"Filler Institute {index + 1}", code=slug.upper(), city="Pune")
            trust = Trust(id=stable_id("trust", slug), institute_id=institute.id, name=f"Filler Trust {index + 1}")
            obligation = Obligation(id=stable_id("obligation", slug), institute_id=institute.id, trust_id=trust.id,
                                    programme="AICTE FDR obligation", required_paise=100000000,
                                    term_years=10, start_date=today, end_date=today + timedelta(days=3650),
                                    state=ObligationState.COVERED.value)
            session.add_all([institute, trust, obligation])
            state = states[index % len(states)]
            bank = ["BRB", "HCB", "SCB"][filler.randrange(3)]
            _instrument(session, obligation, slug, bank, state, today, f"{bank}-FDR-2024-{index + 100:06d}",
                        today + timedelta(days=30 + index), discrepancy=("D-02", Severity.HIGH.value) if index == 2 else
                        (("D-07", Severity.HIGH.value) if index == 6 else (("D-11", Severity.HIGH.value) if index == 10 else None)))
        session.commit()
    finally:
        session.close()
