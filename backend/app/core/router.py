"""
Core System Router for Sakshya (§3.5).

Endpoints:
  Auth:
    POST /auth/login
    POST /auth/step-up
    GET  /me
    GET  /demo/users
  Audit Chain (§7.7):
    GET  /audit
    GET  /audit/verify
    GET  /audit/verify-chain
    POST /admin/audit/tamper-demo
    POST /admin/audit/repair-demo
  Clock Persistence & Time-Travel (§3.6):
    GET  /admin/clock
    POST /admin/clock/advance
    POST /admin/clock/reset
  Policy Parameters (§6.4):
    GET  /policy
  Notifications Subsystem (§3.4, §7.8):
    GET  /notifications
    POST /notifications/{id}/read
    POST /notifications/read-all
  Job Registry & Scheduled Ticks (§1.3, §3.5):
    POST /admin/tick
"""
from datetime import timedelta
import os
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import audit, clock, jobs, notify, policy
from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.enums import Role
from app.core.errors import NotFoundError, UnauthenticatedError, ValidationError
from app.core.models import User
from app.core.security import create_access_token, verify_password

router = APIRouter(tags=["core"])

DEFAULT_STEP_UP_PIN: str = "246810"
STEP_UP_TTL_MINUTES: int = 5


# ── Auth & User Schemas ────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., description="Username")
    password: str = Field(..., description="Password")


class UserOut(BaseModel):
    id: str
    username: str
    display_name: str
    roles: list[str]
    institute_id: str | None = None
    bank_id: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class StepUpRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6, description="6-digit step-up PIN")


class StepUpResponse(BaseModel):
    status: str = "ok"
    message: str = "Step-up verified"
    step_up_until: str


class DemoUserOut(BaseModel):
    username: str
    display_name: str
    roles: list[str]
    institute_id: str | None = None
    bank_id: str | None = None


# ── Audit Schemas ──────────────────────────────────────────────────────────────

class AuditEventOut(BaseModel):
    seq: int
    ts: str | None
    actor_id: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: str
    payload: dict[str, Any]
    prev_hash: str
    hash: str


class AuditListResponse(BaseModel):
    items: list[AuditEventOut]
    total: int
    page: int
    page_size: int


class AuditVerifyResponse(BaseModel):
    ok: bool
    checked: int
    first_broken_seq: int | None = None
    reason: str | None = None


class TamperDemoRequest(BaseModel):
    seq: int = Field(default=1, ge=1, description="Audit sequence to tamper")
    new_payload: dict[str, Any] | None = Field(default=None, description="Optional new payload")


class TamperDemoResponse(BaseModel):
    status: str = "tampered"
    tampered_seq: int


class RepairDemoRequest(BaseModel):
    from_seq: int = Field(default=1, ge=1, description="Sequence from which to repair chain")


class RepairDemoResponse(BaseModel):
    status: str = "repaired"
    repaired_count: int


# ── Clock & Job Schemas ────────────────────────────────────────────────────────

class ClockResponse(BaseModel):
    now: str
    current_time: str
    simulated_at: str
    offset_seconds: int
    jobs_run: list[dict[str, Any]] | None = None


class ClockAdvanceRequest(BaseModel):
    days: int = Field(default=0, ge=0)
    hours: int = Field(default=0, ge=0)
    minutes: int = Field(default=0, ge=0)
    seconds: int = Field(default=0, ge=0)
    run_tick: bool = Field(default=False)


class TickResponse(BaseModel):
    status: str = "ok"
    simulated_time: str
    jobs_run: list[dict[str, Any]]


# ── Notification Schemas ───────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: str
    title: str
    body: str | None = None
    level: str = "INFO"
    link: str | None = None
    read: bool = False
    user_id: str | None = None
    role: str | None = None
    institute_id: str | None = None
    bank_id: str | None = None
    created_at: str | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    unread_count: int
    total: int


class NotificationReadResponse(BaseModel):
    status: str = "ok"
    marked_read: int


# ── Authentication & User Endpoints ───────────────────────────────────────────

@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with username + password to receive a JWT access token."""
    user = db.query(User).filter(User.username == payload.username.strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise UnauthenticatedError("Invalid username or password")

    token = create_access_token(user)
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=UserOut(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            roles=user.roles,
            institute_id=user.institute_id,
            bank_id=user.bank_id,
        ),
    )


@router.post("/auth/step-up", response_model=StepUpResponse)
def step_up(
    payload: StepUpRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify 6-digit step-up PIN for privileged operations."""
    if payload.pin != DEFAULT_STEP_UP_PIN:
        raise ValidationError("Invalid step-up PIN")

    until = clock.now() + timedelta(minutes=STEP_UP_TTL_MINUTES)
    current_user.step_up_until = until
    db.commit()

    return StepUpResponse(
        status="ok",
        message="Step-up verified",
        step_up_until=until.isoformat(),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve profile and assigned role scopes of the currently authenticated user."""
    return UserOut(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
        roles=current_user.roles,
        institute_id=current_user.institute_id,
        bank_id=current_user.bank_id,
    )


@router.get("/demo/users", response_model=list[DemoUserOut])
def get_demo_users(db: Session = Depends(get_db)):
    """List available pre-seeded demo users for development and demonstration."""
    is_demo = os.getenv("DEMO_MODE", "true").lower() == "true"
    if not is_demo:
        raise NotFoundError("Demo users endpoint is disabled in production mode")

    users = db.query(User).order_by(User.username).all()
    return [
        DemoUserOut(
            username=u.username,
            display_name=u.display_name,
            roles=u.roles,
            institute_id=u.institute_id,
            bank_id=u.bank_id,
        )
        for u in users
    ]


# ── Audit Chain Endpoints (§7.7) ───────────────────────────────────────────────

_AUDIT_ROLES = [
    Role.AUDITOR,
    Role.SYSTEM_ADMIN,
    Role.SCRUTINY_OFFICER,
    Role.APPROVING_OFFICER,
    Role.LEADERSHIP,
]


@router.get("/audit", response_model=AuditListResponse)
def list_audit_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    actor_id: str | None = None,
    actor_role: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    current_user: User = Depends(require_roles(*_AUDIT_ROLES)),
    db: Session = Depends(get_db),
):
    """List paginated audit events with optional field filters."""
    items, total = audit.get_events(
        db=db,
        page=page,
        page_size=page_size,
        actor_id=actor_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    return AuditListResponse(
        items=[AuditEventOut(**e.to_dict()) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/audit/verify", response_model=AuditVerifyResponse)
@router.get("/audit/verify-chain", response_model=AuditVerifyResponse)
def verify_audit_chain(
    start_seq: int = Query(1, ge=1),
    end_seq: int | None = None,
    current_user: User = Depends(require_roles(*_AUDIT_ROLES)),
    db: Session = Depends(get_db),
):
    """Cryptographically verify the integrity of the audit hash chain."""
    result = audit.verify_chain(db=db, start_seq=start_seq, end_seq=end_seq)
    return AuditVerifyResponse(**result)


@router.post("/admin/audit/tamper-demo", response_model=TamperDemoResponse)
def tamper_audit_demo(
    payload: TamperDemoRequest,
    current_user: User = Depends(require_roles(Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Simulate illegal record tampering for live demonstration."""
    is_demo = os.getenv("DEMO_MODE", "true").lower() == "true"
    if not is_demo:
        raise NotFoundError("Tamper demo is disabled outside DEMO_MODE")

    audit.tamper_event(db=db, seq=payload.seq, new_payload=payload.new_payload)
    return TamperDemoResponse(status="tampered", tampered_seq=payload.seq)


@router.post("/admin/audit/repair-demo", response_model=RepairDemoResponse)
def repair_audit_demo(
    payload: RepairDemoRequest,
    current_user: User = Depends(require_roles(Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Recalculate hashes to restore chain integrity after live demonstration."""
    is_demo = os.getenv("DEMO_MODE", "true").lower() == "true"
    if not is_demo:
        raise NotFoundError("Repair demo is disabled outside DEMO_MODE")

    result = audit.repair_chain(db=db, from_seq=payload.from_seq)
    return RepairDemoResponse(**result)


# ── Clock Persistence & Time-Travel Endpoints (§3.6) ──────────────────────────

def _clock_response(jobs_run: list[dict[str, Any]] | None = None) -> ClockResponse:
    now_iso = clock.now().isoformat()
    return ClockResponse(
        now=now_iso,
        current_time=now_iso,
        simulated_at=now_iso,
        offset_seconds=clock.get_offset(),
        jobs_run=jobs_run,
    )


@router.get("/admin/clock", response_model=ClockResponse)
def get_clock(db: Session = Depends(get_db)):
    """Retrieve simulated clock time and offset."""
    return _clock_response()


@router.post("/admin/clock/advance", response_model=ClockResponse)
def advance_clock(
    payload: ClockAdvanceRequest,
    current_user: User = Depends(require_roles(Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Advance the simulated system clock, optionally trigger background tick, and persist state."""
    clock.advance(
        days=payload.days,
        hours=payload.hours,
        minutes=payload.minutes,
        seconds=payload.seconds,
        db=db,
    )
    audit.log(
        actor=current_user,
        action="CLOCK_ADVANCED",
        entity_type="CLOCK",
        entity_id="1",
        payload={
            "days": payload.days,
            "hours": payload.hours,
            "minutes": payload.minutes,
            "seconds": payload.seconds,
            "run_tick": payload.run_tick,
            "new_offset": clock.get_offset(),
        },
        db=db,
    )

    jobs_run = None
    if payload.run_tick:
        jobs_run = jobs.run_all(db)
        audit.log(
            actor=current_user,
            action="TICK_EXECUTED",
            entity_type="JOB_RUNNER",
            entity_id="advance_hook",
            payload={"jobs_count": len(jobs_run)},
            db=db,
        )

    return _clock_response(jobs_run=jobs_run)


@router.post("/admin/clock/reset", response_model=ClockResponse)
def reset_clock(
    current_user: User = Depends(require_roles(Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Reset simulated clock back to real system UTC time."""
    clock.reset(db=db)
    audit.log(
        actor=current_user,
        action="CLOCK_RESET",
        entity_type="CLOCK",
        entity_id="1",
        payload={"offset_seconds": 0},
        db=db,
    )
    return _clock_response()


# ── Job Registry & Scheduled Ticks (§1.3, §3.5) ────────────────────────────────

@router.post("/admin/tick", response_model=TickResponse)
def run_tick(
    force: bool = Query(False, description="Force re-running jobs even if already executed for current slot"),
    current_user: User = Depends(require_roles(Role.SYSTEM_ADMIN)),
    db: Session = Depends(get_db),
):
    """Execute all registered background jobs in order with idempotent deduplication."""
    jobs_run = jobs.run_all(db=db, force=force)
    audit.log(
        actor=current_user,
        action="TICK_EXECUTED",
        entity_type="JOB_RUNNER",
        entity_id="admin_tick",
        payload={"jobs_count": len(jobs_run), "force": force},
        db=db,
    )
    return TickResponse(
        status="ok",
        simulated_time=clock.now().isoformat(),
        jobs_run=jobs_run,
    )


# ── Policy Parameters (§6.4) ──────────────────────────────────────────────────

@router.get("/policy")
def get_policy_parameters(
    key: str | None = None,
    current_user: User = Depends(require_roles(*_AUDIT_ROLES)),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve active regulatory policy parameters."""
    if key is not None:
        return {"key": key, "value": policy.get(key, db=db)}
    return policy.get_all(db=db)


# ── Notifications Endpoints (§3.4, §7.8) ───────────────────────────────────────

@router.get("/notifications", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(False, description="Filter only unread notifications"),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve notifications scoped to current_user (institute users never see officer alerts)."""
    items, unread_count = notify.get_notifications(
        current_user=current_user,
        unread_only=unread_only,
        limit=limit,
        db=db,
    )
    return NotificationListResponse(
        items=[NotificationOut(**n.to_dict()) for n in items],
        unread_count=unread_count,
        total=len(items),
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a notification visible to current_user as read."""
    notif = notify.mark_as_read(
        notification_id=notification_id,
        current_user=current_user,
        db=db,
    )
    return NotificationOut(**notif.to_dict())


@router.post("/notifications/read-all", response_model=NotificationReadResponse)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all unread notifications visible to current_user as read."""
    count = notify.mark_all_as_read(current_user=current_user, db=db)
    return NotificationReadResponse(status="ok", marked_read=count)
