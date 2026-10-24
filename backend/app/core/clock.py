"""
Simulated clock foundation for Sakshya (§3.6, Golden Rule #8).

datetime.now() is strictly banned in business logic.
All components import and use `clock.now()`.
"""
from datetime import datetime, timedelta, timezone

# In-memory offset in seconds (PR-3 will persist this to clock_state table)
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


def set_offset(seconds: int) -> None:
    """Set the clock offset in seconds."""
    global _offset_seconds
    _offset_seconds = int(seconds)


def advance(days: int = 0, hours: int = 0, minutes: int = 0, seconds: int = 0) -> datetime:
    """Advance the simulated clock forward."""
    global _offset_seconds
    added = days * 86400 + hours * 3600 + minutes * 60 + seconds
    _offset_seconds += added
    return now()


def reset() -> datetime:
    """Reset simulated clock back to real system UTC time."""
    global _offset_seconds
    _offset_seconds = 0
    return now()

