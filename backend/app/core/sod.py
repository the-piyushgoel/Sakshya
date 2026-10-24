"""
Segregation of Duties (SoD) enforcement engine (§3.6).

Raises SodViolationError (HTTP 403, error code SOD_VIOLATION) whenever
maker and checker, or scrutiny officer and approving officer, are the same entity.
"""
from typing import Any

from app.core.errors import SodViolationError


def ensure_different(
    actor: Any,
    other_actor: Any,
    rule: str = "Maker and checker cannot be the same user",
) -> None:
    """
    Enforce that two actors are distinct.

    Accepts User objects or ID/username strings. If both refer to the same user,
    raises SodViolationError immediately.
    """
    if not actor or not other_actor:
        return

    actor_id = getattr(actor, "id", None) or getattr(actor, "username", None) or str(actor)
    other_id = getattr(other_actor, "id", None) or getattr(other_actor, "username", None) or str(other_actor)

    if actor_id == other_id:
        raise SodViolationError(rule)

