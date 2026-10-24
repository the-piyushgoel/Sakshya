"""
Cryptographic Audit Hash Chain Engine for Sakshya (§7.7).

Provides tamper-evident audit logging where every event is cryptographically linked
to its immediate predecessor via SHA-256 recursive hashing:
    hash_i = SHA-256(prev_hash_{i-1} || canonical_json(entry_i))
Genesis block uses prev_hash = "0" * 64.
"""
from datetime import datetime, timezone
import hashlib
import json
import threading
from typing import Any

from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import SessionLocal
from app.core.errors import NotFoundError
from app.core.models import AuditEvent, User

_audit_lock = threading.Lock()
GENESIS_PREV_HASH: str = "0" * 64


def normalize_timestamp(ts: datetime | str) -> str:
    """Normalize datetime or string to ISO 8601 UTC with 'Z' suffix."""
    if isinstance(ts, str):
        if not ts.endswith("Z") and "+" not in ts:
            return f"{ts}Z"
        return ts
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    return f"{ts.isoformat()}Z"


def canonical_json(data: Any) -> str:
    """
    Format dictionary according to RFC 8785:
    - Keys sorted lexicographically
    - Compact separators (no spaces after comma or colon)
    - UTF-8 representation without ascii escaping
    """
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def serialize_entry(
    seq: int,
    ts: datetime | str,
    actor_id: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Construct deterministic dictionary representation for hash input."""
    return {
        "action": str(action),
        "actor_id": str(actor_id),
        "actor_role": str(actor_role),
        "entity_id": str(entity_id),
        "entity_type": str(entity_type),
        "payload": payload or {},
        "seq": int(seq),
        "ts": normalize_timestamp(ts),
    }


def compute_event_hash(prev_hash: str, entry_dict: dict[str, Any]) -> str:
    """Compute SHA-256 hash of prev_hash concatenated with canonical JSON of entry."""
    canonical_repr = canonical_json(entry_dict)
    combined = (prev_hash + canonical_repr).encode("utf-8")
    return hashlib.sha256(combined).hexdigest()


def log(
    actor: User | str,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, Any] | None = None,
    actor_role: str | None = None,
    db: Session | None = None,
) -> AuditEvent:
    """
    Append an immutable event to the tamper-evident cryptographic hash chain.

    Thread-safe and sequence-locked. Can be called with an existing DB session
    or independently (in which case a dedicated session is managed).
    """
    # Resolve actor identity and role
    if hasattr(actor, "id"):
        actor_id = getattr(actor, "id")
        if actor_role is None:
            roles = getattr(actor, "roles", [])
            actor_role = roles[0] if roles else "SYSTEM"
    else:
        actor_id = str(actor)
        if actor_role is None:
            actor_role = "SYSTEM"

    clean_payload = payload or {}
    now_dt = clock.now()

    with _audit_lock:
        session = db or SessionLocal()
        should_close = db is None
        try:
            # Determine next sequence and parent hash
            last_event = session.query(AuditEvent).order_by(AuditEvent.seq.desc()).first()
            if last_event is None:
                seq = 1
                prev_hash = GENESIS_PREV_HASH
            else:
                seq = last_event.seq + 1
                prev_hash = last_event.hash

            entry_dict = serialize_entry(
                seq=seq,
                ts=now_dt,
                actor_id=actor_id,
                actor_role=actor_role,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id),
                payload=clean_payload,
            )
            event_hash = compute_event_hash(prev_hash, entry_dict)

            event = AuditEvent(
                seq=seq,
                ts=now_dt,
                actor_id=actor_id,
                actor_role=actor_role,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id),
                payload_json=clean_payload,
                prev_hash=prev_hash,
                hash=event_hash,
            )
            session.add(event)

            if should_close:
                session.commit()
                session.refresh(event)
            else:
                session.flush()

            return event
        finally:
            if should_close:
                session.close()


def verify_chain(
    db: Session,
    start_seq: int = 1,
    end_seq: int | None = None,
) -> dict[str, Any]:
    """
    Verify the cryptographic integrity of the audit hash chain.

    Recomputes SHA-256 for each entry from canonical fields and validates
    prev_hash linkage. Returns status, count checked, and first broken sequence if any.
    """
    query = db.query(AuditEvent).filter(AuditEvent.seq >= start_seq)
    if end_seq is not None:
        query = query.filter(AuditEvent.seq <= end_seq)
    events = query.order_by(AuditEvent.seq.asc()).all()

    if not events:
        return {"ok": True, "checked": 0, "first_broken_seq": None}

    checked = 0
    expected_prev_hash: str | None = None

    if start_seq > 1:
        prev_row = db.query(AuditEvent).filter(AuditEvent.seq == start_seq - 1).first()
        if prev_row:
            expected_prev_hash = prev_row.hash
        else:
            return {
                "ok": False,
                "checked": 0,
                "first_broken_seq": start_seq,
                "reason": f"Preceding sequence {start_seq - 1} not found",
            }

    for i, event in enumerate(events):
        # 1. Check sequence and prev_hash continuity
        if i == 0 and start_seq == 1:
            if event.seq != 1:
                return {
                    "ok": False,
                    "checked": checked,
                    "first_broken_seq": event.seq,
                    "reason": f"Expected sequence 1, got {event.seq}",
                }
            if event.prev_hash != GENESIS_PREV_HASH:
                return {
                    "ok": False,
                    "checked": checked,
                    "first_broken_seq": event.seq,
                    "reason": "Genesis entry prev_hash does not match 64 zeroes",
                }
        else:
            expected_prev = expected_prev_hash if (i == 0 and expected_prev_hash) else events[i - 1].hash
            expected_seq = start_seq if i == 0 else events[i - 1].seq + 1

            if event.seq != expected_seq:
                return {
                    "ok": False,
                    "checked": checked,
                    "first_broken_seq": event.seq,
                    "reason": f"Sequence gap: expected {expected_seq}, found {event.seq}",
                }
            if event.prev_hash != expected_prev:
                return {
                    "ok": False,
                    "checked": checked,
                    "first_broken_seq": event.seq,
                    "reason": f"prev_hash mismatch at sequence {event.seq}",
                }

        # 2. Recompute cryptographic hash from payload
        entry_dict = serialize_entry(
            seq=event.seq,
            ts=event.ts,
            actor_id=event.actor_id,
            actor_role=event.actor_role,
            action=event.action,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            payload=event.payload_json,
        )
        recomputed = compute_event_hash(event.prev_hash, entry_dict)
        if recomputed != event.hash:
            return {
                "ok": False,
                "checked": checked,
                "first_broken_seq": event.seq,
                "reason": f"Hash mismatch at sequence {event.seq}",
            }

        checked += 1

    return {"ok": True, "checked": checked, "first_broken_seq": None}


def tamper_event(
    db: Session,
    seq: int,
    new_payload: dict[str, Any] | None = None,
) -> AuditEvent:
    """
    Simulate illegal data tampering by altering payload directly in SQLite
    without updating cryptographic hash or subsequent hashes.
    """
    event = db.query(AuditEvent).filter(AuditEvent.seq == seq).first()
    if not event:
        raise NotFoundError(f"Audit event with sequence {seq} not found")

    event.payload_json = new_payload or {
        "tampered": True,
        "note": "Illegal modification for tamper demo",
        "original": event.payload_json,
    }
    db.commit()
    db.refresh(event)
    return event


def repair_chain(
    db: Session,
    from_seq: int = 1,
) -> dict[str, Any]:
    """
    Recalculate hashes from from_seq forward to restore chain integrity after demo.
    """
    events = db.query(AuditEvent).order_by(AuditEvent.seq.asc()).all()
    if not events:
        return {"status": "repaired", "repaired_count": 0}

    repaired_count = 0
    prev_hash = GENESIS_PREV_HASH

    for i, event in enumerate(events):
        if i == 0:
            event.prev_hash = GENESIS_PREV_HASH
        else:
            event.prev_hash = events[i - 1].hash

        entry_dict = serialize_entry(
            seq=event.seq,
            ts=event.ts,
            actor_id=event.actor_id,
            actor_role=event.actor_role,
            action=event.action,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            payload=event.payload_json,
        )
        event.hash = compute_event_hash(event.prev_hash, entry_dict)
        repaired_count += 1

    db.commit()
    return {"status": "repaired", "repaired_count": repaired_count}


def get_events(
    db: Session,
    page: int = 1,
    page_size: int = 25,
    actor_id: str | None = None,
    actor_role: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> tuple[list[AuditEvent], int]:
    """Query paginated and filtered audit events."""
    query = db.query(AuditEvent)
    if actor_id:
        query = query.filter(AuditEvent.actor_id == actor_id)
    if actor_role:
        query = query.filter(AuditEvent.actor_role == actor_role)
    if action:
        query = query.filter(AuditEvent.action == action)
    if entity_type:
        query = query.filter(AuditEvent.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditEvent.entity_id == entity_id)

    total = query.count()
    items = (
        query.order_by(AuditEvent.seq.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total

