"""
Notifications subsystem for Sakshya (§3.4, §7.8).

Provides targeted, deduplicated, and scoped in-app alerts across institutes,
banks, and AICTE officers.
"""
from typing import Any
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import SessionLocal
from app.core.enums import Role
from app.core.errors import ForbiddenError, NotFoundError
from app.core.models import Notification, User


def send(
    title: str,
    body: str | None = None,
    user_id: str | None = None,
    role: Role | str | None = None,
    institute_id: str | None = None,
    bank_id: str | None = None,
    level: str = "INFO",
    link: str | None = None,
    dedupe_key: str | None = None,
    db: Session | None = None,
) -> Notification:
    """
    Dispatch a targeted in-app notification.

    If dedupe_key is provided and already exists, returns the existing record
    without creating a duplicate (guaranteeing idempotent alert delivery).
    """
    role_str = role.value if isinstance(role, Role) else role

    session = db or SessionLocal()
    should_close = db is None
    try:
        if dedupe_key:
            existing = session.query(Notification).filter(Notification.dedupe_key == dedupe_key).first()
            if existing:
                return existing

        notif = Notification(
            id=str(uuid4()),
            user_id=user_id,
            role=role_str,
            institute_id=institute_id,
            bank_id=bank_id,
            title=title,
            body=body,
            level=level,
            link=link,
            read=False,
            dedupe_key=dedupe_key,
            created_at=clock.now(),
        )
        session.add(notif)

        if should_close:
            session.commit()
            session.refresh(notif)
        else:
            session.flush()

        return notif
    finally:
        if should_close:
            session.close()


def _scope_filter(current_user: User):
    """
    Construct SQLAlchemy filter condition matching current user's visibility scope.
    Guarantees: 'institute user ko officer ke notification nahi dikhte'.
    """
    # 1. Institute user: strictly scoped to their institute or direct user ID
    if current_user.institute_id:
        return or_(
            Notification.user_id == current_user.id,
            Notification.institute_id == current_user.institute_id,
        )

    # 2. Bank user: scoped to bank, direct user ID, or bank roles
    if current_user.bank_id:
        conditions = [
            Notification.user_id == current_user.id,
            Notification.bank_id == current_user.bank_id,
        ]
        if current_user.roles:
            conditions.append(Notification.role.in_(current_user.roles))
        return or_(*conditions)

    # 3. AICTE Officer / System Admin: scoped to user ID, roles, or global broadcasts
    conditions = [
        Notification.user_id == current_user.id,
        # Global system broadcast (no specific target)
        (
            Notification.user_id.is_(None)
            & Notification.role.is_(None)
            & Notification.institute_id.is_(None)
            & Notification.bank_id.is_(None)
        ),
    ]
    if current_user.roles:
        conditions.append(Notification.role.in_(current_user.roles))

    return or_(*conditions)


def get_notifications(
    current_user: User,
    unread_only: bool = False,
    limit: int = 50,
    db: Session = None,  # type: ignore[assignment]
) -> tuple[list[Notification], int]:
    """
    Query scoped notifications for current_user.
    Returns (items, unread_count).
    """
    scope_cond = _scope_filter(current_user)

    # Base query for user's visible notifications
    base_query = db.query(Notification).filter(scope_cond)

    # Total unread count for the user
    unread_count = base_query.filter(Notification.read == False).count()  # noqa: E712

    # Filtered items list
    items_query = base_query
    if unread_only:
        items_query = items_query.filter(Notification.read == False)  # noqa: E712

    items = (
        items_query.order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return items, unread_count


def mark_as_read(
    notification_id: str,
    current_user: User,
    db: Session,
) -> Notification:
    """Mark a visible notification as read."""
    scope_cond = _scope_filter(current_user)
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, scope_cond)
        .first()
    )
    if not notif:
        raise NotFoundError("Notification not found")

    notif.read = True
    db.commit()
    db.refresh(notif)
    return notif


def mark_all_as_read(
    current_user: User,
    db: Session,
) -> int:
    """Mark all unread visible notifications as read for current_user."""
    scope_cond = _scope_filter(current_user)
    unread = (
        db.query(Notification)
        .filter(scope_cond, Notification.read == False)  # noqa: E712
        .all()
    )
    count = len(unread)
    for n in unread:
        n.read = True
    db.commit()
    return count

