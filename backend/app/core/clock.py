"""
Simulated clock foundation for Sakshya (§3.6, Golden Rule #8).

datetime.now() is strictly banned in business logic.
All components import and use `clock.now()`.
Clock offset is persisted to the `clock_state` database table to survive restarts.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

# In-memory offset in seconds
_offset_seconds: int = 0


def now() -> datetime:
    """Return the current simulated UTC datetime."""
    base = datetime.now(timezone.utc)
    if _offset_seconds:
        return base + timedelta(seconds=_offset_seconds)
    return base


def get_offset() -> int:
    """Return current offset in seconds."""
    return _offset_seconds


def set_offset(seconds: int, db: Any = None) -> None:
    """Set the clock offset in seconds and synchronize with database."""
    global _offset_seconds
    _offset_seconds = int(seconds)
    _persist_offset(db)


def advance(
    days: int = 0,
    hours: int = 0,
    minutes: int = 0,
    seconds: int = 0,
    db: Any = None,
) -> datetime:
    """Advance the simulated clock forward and persist new state."""
    global _offset_seconds
    added = days * 86400 + hours * 3600 + minutes * 60 + seconds
    _offset_seconds += added
    _persist_offset(db)
    return now()


def reset(db: Any = None) -> datetime:
    """Reset simulated clock back to real system UTC time and persist."""
    global _offset_seconds
    _offset_seconds = 0
    _persist_offset(db)
    return now()


def sync_from_db(db: Any = None) -> int:
    """
    Synchronize the in-memory offset from the persisted `clock_state` table.
    Called on application startup.
    """
    global _offset_seconds
    try:
        from app.core.db import SessionLocal
        from app.core.models import ClockState

        session = db or SessionLocal()
        should_close = db is None
        try:
            state = session.query(ClockState).filter(ClockState.id == 1).first()
            if state is not None:
                _offset_seconds = state.offset_seconds
        finally:
            if should_close:
                session.close()
    except Exception:
        # Ignore during early migrations or table creation
        pass
    return _offset_seconds


def _persist_offset(db: Any = None) -> None:
    """Persist current offset to `clock_state` table if database is accessible."""
    try:
        from app.core.db import SessionLocal
        from app.core.models import ClockState

        session = db or SessionLocal()
        should_close = db is None
        try:
            state = session.query(ClockState).filter(ClockState.id == 1).first()
            current_time = now()
            if state is not None:
                state.offset_seconds = _offset_seconds
                state.updated_at = current_time
            else:
                session.add(
                    ClockState(
                        id=1,
                        offset_seconds=_offset_seconds,
                        updated_at=current_time,
                    )
                )

            if should_close:
                session.commit()
            else:
                session.flush()
        finally:
            if should_close:
                session.close()
    except Exception:
        pass
