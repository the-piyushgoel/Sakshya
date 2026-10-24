"""
Core Authentication and User router (§3.5).

Endpoints:
  POST /auth/login
  POST /auth/step-up
  GET  /me
  GET  /demo/users
"""
from datetime import timedelta
import os
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import NotFoundError, UnauthenticatedError, ValidationError
from app.core.models import User
from app.core.security import create_access_token, verify_password

router = APIRouter(tags=["auth"])

DEFAULT_STEP_UP_PIN: str = "246810"
STEP_UP_TTL_MINUTES: int = 5


# ── Schemas ───────────────────────────────────────────────────────────────────

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


# ── Endpoints ─────────────────────────────────────────────────────────────────

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

