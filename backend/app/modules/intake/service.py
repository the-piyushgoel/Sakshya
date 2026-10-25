"""
Intake service implementation adhering to CONTRACT.md §3.6.

Single source of truth for instrument state transitions, field trust extraction,
and obligation coverage recomputations.
"""
from datetime import date
from typing import Any
from uuid import uuid4

from app.core import audit, clock
from app.core.db import SessionLocal
from app.core.enums import DiscrepancyStatus, InstrumentState, ObligationState
from app.core.errors import InvalidStateError, NotFoundError
from app.core.models import User
from app.modules.intake.models import (
    Discrepancy,
    FieldTrust,
    Institute,
    Instrument,
    InstrumentStateHistory,
    Obligation,
)
from sqlalchemy.orm import Session


def get_field_value(instrument: Instrument, field_name: str, db: Session | None = None) -> str | None:
    """Retrieve string value of a field from FieldTrust or InstrumentVersion."""
    # 1. Try relationship fields
    if instrument.fields:
        for f in instrument.fields:
            if f.field_name == field_name and f.value is not None:
                return str(f.value)

    # 2. Try latest version fields_json
    if instrument.versions:
        sorted_v = sorted(instrument.versions, key=lambda v: v.version_no, reverse=True)
        if sorted_v and sorted_v[0].fields_json:
            val = sorted_v[0].fields_json.get(field_name)
            if val is not None:
                return str(val)

    # 3. DB query fallback
    if db is not None:
        ft = (
            db.query(FieldTrust)
            .filter(FieldTrust.instrument_id == instrument.id, FieldTrust.field_name == field_name)
            .first()
        )
        if ft and ft.value is not None:
            return str(ft.value)

    return None


def parse_date(date_str: str | None) -> date | None:
    """Parse date from ISO string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)."""
    if not date_str:
        return None
    try:
        clean = str(date_str)[:10]
        return date.fromisoformat(clean)
    except (ValueError, TypeError):
        return None


def get_instrument(instrument_id: str, db: Session | None = None) -> Instrument | None:
    """Fetch instrument by primary key ID."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        return session.query(Instrument).filter(Instrument.id == instrument_id).first()
    finally:
        if should_close:
            session.close()


def assign_scrutiny_officer(instrument_id: str, officer_id: str, db: Session | None = None) -> Instrument:
    """Set the first scrutiny officer assigned to an instrument."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        instrument = session.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        if not instrument.scrutiny_officer_id:
            instrument.scrutiny_officer_id = officer_id
            if should_close:
                session.commit()
                session.refresh(instrument)
            else:
                session.flush()
        return instrument
    finally:
        if should_close:
            session.close()


def has_open_high(instrument_id: str, db: Session | None = None) -> bool:
    """Return whether an instrument has an OPEN or ESCALATED HIGH discrepancy."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        return session.query(Discrepancy.id).filter(
            Discrepancy.instrument_id == instrument_id,
            Discrepancy.severity == "HIGH",
            Discrepancy.status.in_((DiscrepancyStatus.OPEN.value, DiscrepancyStatus.ESCALATED.value)),
        ).first() is not None
    finally:
        if should_close:
            session.close()


def ensure_not_quarantined(instrument_id: str, db: Session | None = None) -> Instrument:
    """Return an instrument, raising INVALID_STATE when it is quarantined."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        instrument = session.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise NotFoundError("Instrument", instrument_id)
        if instrument.is_quarantined:
            raise InvalidStateError("Instrument is quarantined")
        return instrument
    finally:
        if should_close:
            session.close()


def get_obligation(obligation_id: str, db: Session | None = None) -> Obligation | None:
    """Fetch obligation by primary key ID."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        return session.query(Obligation).filter(Obligation.id == obligation_id).first()
    finally:
        if should_close:
            session.close()


def get_institute(institute_id: str, db: Session) -> Institute | None:
    """Fetch an institute within the caller's read session."""
    return db.query(Institute).filter(Institute.id == institute_id).first()


def list_obligations(db: Session, institute_id: str | None = None) -> list[Obligation]:
    """List obligations, optionally restricted to one institute."""
    query = db.query(Obligation)
    if institute_id:
        query = query.filter(Obligation.institute_id == institute_id)
    return query.order_by(Obligation.id).all()


def list_instruments(
    db: Session,
    institute_id: str | None = None,
    state: str | None = None,
    obligation_id: str | None = None,
) -> list[Instrument]:
    """List instruments with optional institute and state filtering."""
    query = db.query(Instrument)
    if institute_id:
        query = query.filter(Instrument.institute_id == institute_id)
    if state:
        query = query.filter(Instrument.state == state)
    if obligation_id:
        query = query.filter(Instrument.obligation_id == obligation_id)
    return query.order_by(Instrument.created_at, Instrument.id).all()


def get_fields(instrument_id: str, db: Session | None = None) -> dict[str, dict[str, Any]]:
    """Retrieve full field dictionary mapping {field_name: {value, trust, source}}."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        fields = session.query(FieldTrust).filter(FieldTrust.instrument_id == instrument_id).all()
        result = {}
        for f in fields:
            result[f.field_name] = {
                "value": f.value,
                "trust": f.trust,
                "source": f.source,
                "evidence_ref": f.evidence_ref,
            }
        return result
    finally:
        if should_close:
            session.close()


def set_field_trust(
    instrument_id: str, field_name: str, trust: str, source: str,
    evidence_ref: str, value: str | None = None, db: Session | None = None,
) -> FieldTrust:
    """Set a field's trust metadata through the intake service boundary."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        field = session.query(FieldTrust).filter(
            FieldTrust.instrument_id == instrument_id,
            FieldTrust.field_name == field_name,
        ).first()
        if not field:
            field = FieldTrust(
                id=str(uuid4()), instrument_id=instrument_id, field_name=field_name,
                value=value, trust=trust, source=source, evidence_ref=evidence_ref,
                set_at=clock.now(),
            )
            session.add(field)
        else:
            if value is not None:
                field.value = value
            field.trust = trust
            field.source = source
            field.evidence_ref = evidence_ref
            field.set_at = clock.now()
        if should_close:
            session.commit()
            session.refresh(field)
        else:
            session.flush()
        return field
    finally:
        if should_close:
            session.close()


def transition(
    instrument_id: str,
    to_state: InstrumentState | str,
    actor: User | str = "SYSTEM",
    reason: str | None = None,
    db: Session | None = None,
) -> Instrument:
    """
    Transition an instrument to a new state (§5.1).

    Single source of truth for instrument state mutations. Appends to
    `instrument_state_history` and appends an immutable entry to `audit_event`.
    """
    to_state_str = to_state.value if isinstance(to_state, InstrumentState) else str(to_state)
    session = db or SessionLocal()
    should_close = db is None
    try:
        instrument = session.query(Instrument).filter(Instrument.id == instrument_id).first()
        if not instrument:
            raise NotFoundError(f"Instrument '{instrument_id}' not found")

        from_state_str = instrument.state
        if from_state_str == to_state_str:
            return instrument

        # Update state
        instrument.state = to_state_str

        # Actor ID resolution
        actor_id = getattr(actor, "id", str(actor))

        # Record history
        hist = InstrumentStateHistory(
            id=str(uuid4()),
            instrument_id=instrument_id,
            from_state=from_state_str,
            to_state=to_state_str,
            actor_id=actor_id,
            reason=reason,
            at=clock.now(),
        )
        session.add(hist)

        # Record audit event
        audit.log(
            actor=actor,
            action=f"INSTRUMENT_{to_state_str}",
            entity_type="INSTRUMENT",
            entity_id=instrument_id,
            payload={
                "from_state": from_state_str,
                "to_state": to_state_str,
                "reason": reason,
            },
            db=session,
        )

        if should_close:
            session.commit()
            session.refresh(instrument)
        else:
            session.flush()

        return instrument
    finally:
        if should_close:
            session.close()


def add_discrepancy(
    instrument_id: str,
    code: str,
    severity: str,
    details: dict[str, Any] | None = None,
    db: Session | None = None,
) -> Discrepancy:
    """Record an operational discrepancy against an instrument."""
    session = db or SessionLocal()
    should_close = db is None
    try:
        disc = Discrepancy(
            id=str(uuid4()),
            instrument_id=instrument_id,
            code=code,
            severity=severity,
            status=DiscrepancyStatus.OPEN.value,
            details_json=details or {},
            created_at=clock.now(),
        )
        session.add(disc)
        if should_close:
            session.commit()
            session.refresh(disc)
        else:
            session.flush()
        return disc
    finally:
        if should_close:
            session.close()


def recompute_coverage(
    obligation_id: str,
    db: Session | None = None,
) -> Obligation:
    """
    Recompute obligation coverage based on active instruments (§3.6).

    Sums principal from valid instruments. Transitions obligation state
    between PENDING_DEPOSIT, PARTIALLY_COVERED, COVERED, and TERM_COMPLETE.
    """
    session = db or SessionLocal()
    should_close = db is None
    try:
        obligation = session.query(Obligation).filter(Obligation.id == obligation_id).first()
        if not obligation:
            raise NotFoundError(f"Obligation '{obligation_id}' not found")

        instruments = (
            session.query(Instrument)
            .filter(
                Instrument.obligation_id == obligation_id,
                Instrument.is_quarantined == False,
            )
            .all()
        )

        today = clock.now().date()
        old_state = obligation.state

        # Check if obligation term is fulfilled
        if obligation.end_date <= today:
            term_eligible_states = {
                InstrumentState.ACTIVE.value,
                InstrumentState.RENEWAL_DUE.value,
                InstrumentState.MATURED.value,
            }
            term_paise = 0
            for ins in instruments:
                if ins.state in term_eligible_states:
                    val = get_field_value(ins, "principal_paise", session)
                    if val:
                        try:
                            term_paise += int(val)
                        except ValueError:
                            pass
            if term_paise >= obligation.required_paise:
                new_state = ObligationState.TERM_COMPLETE.value
            elif term_paise > 0:
                new_state = ObligationState.PARTIALLY_COVERED.value
            else:
                new_state = ObligationState.PENDING_DEPOSIT.value
        else:
            # Active term: only ACTIVE and RENEWAL_DUE count towards coverage
            active_states = {InstrumentState.ACTIVE.value, InstrumentState.RENEWAL_DUE.value}
            active_paise = 0
            for ins in instruments:
                if ins.state in active_states:
                    val = get_field_value(ins, "principal_paise", session)
                    if val:
                        try:
                            active_paise += int(val)
                        except ValueError:
                            pass
            if active_paise >= obligation.required_paise:
                new_state = ObligationState.COVERED.value
            elif active_paise > 0:
                new_state = ObligationState.PARTIALLY_COVERED.value
            else:
                new_state = ObligationState.PENDING_DEPOSIT.value

        if old_state != new_state:
            obligation.state = new_state
            audit.log(
                actor="SYSTEM",
                action="OBLIGATION_COVERAGE_CHANGED",
                entity_type="OBLIGATION",
                entity_id=obligation_id,
                payload={
                    "from_state": old_state,
                    "to_state": new_state,
                    "required_paise": obligation.required_paise,
                },
                db=session,
            )

        if should_close:
            session.commit()
            session.refresh(obligation)
        else:
            session.flush()

        return obligation
    finally:
        if should_close:
            session.close()


def set_obligation_state(
    obligation_id: str,
    state: ObligationState | str,
    actor: User | str = "SYSTEM",
    reason: str | None = None,
    db: Session | None = None,
) -> Obligation:
    """Manually update obligation state with audit logging."""
    state_str = state.value if isinstance(state, ObligationState) else str(state)
    session = db or SessionLocal()
    should_close = db is None
    try:
        obligation = session.query(Obligation).filter(Obligation.id == obligation_id).first()
        if not obligation:
            raise NotFoundError(f"Obligation '{obligation_id}' not found")

        old_state = obligation.state
        obligation.state = state_str

        audit.log(
            actor=actor,
            action=f"OBLIGATION_{state_str}",
            entity_type="OBLIGATION",
            entity_id=obligation_id,
            payload={
                "from_state": old_state,
                "to_state": state_str,
                "reason": reason,
            },
            db=session,
        )

        if should_close:
            session.commit()
            session.refresh(obligation)
        else:
            session.flush()

        return obligation
    finally:
        if should_close:
            session.close()

