"""
FastAPI security and permission dependencies (§3.6).
"""
from typing import Callable

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import get_db
from app.core.enums import Role
from app.core.errors import ForbiddenError, StepUpRequiredError, UnauthenticatedError
from app.core.models import User
from app.core.security import decode_access_token

_security_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate current authenticated User from the Bearer JWT token.
    Raises UnauthenticatedError (HTTP 401) on any failure.
    """
    token: str | None = None
    if credentials:
        token = credentials.credentials
    else:
        # Fallback: check raw Authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise UnauthenticatedError("Authentication required")

    claims = decode_access_token(token)
    user_id = claims.get("sub")
    if not user_id:
        raise UnauthenticatedError("Token missing user subject")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise UnauthenticatedError("User account no longer exists")

    return user


def require_roles(*allowed_roles: Role | str) -> Callable[[User], User]:
    """
    Enforce that the authenticated user possesses at least one of the allowed roles.
    Raises ForbiddenError (HTTP 403) if unauthorized.
    """
    allowed_values = {r.value if isinstance(r, Role) else str(r) for r in allowed_roles}

    def role_dependency(user: User = Depends(get_current_user)) -> User:
        user_roles = set(user.roles)
        if not user_roles.intersection(allowed_values):
            raise ForbiddenError(
                f"Action requires one of roles: {sorted(allowed_values)}; user has: {sorted(user_roles)}"
            )
        return user

    return role_dependency


def require_step_up(user: User = Depends(get_current_user)) -> User:
    """
    Enforce that the user has a fresh step-up authentication.
    Raises StepUpRequiredError (HTTP 403, code STEP_UP_REQUIRED) if step-up is expired or missing.
    """
    until = user.step_up_until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=clock.now().tzinfo)

    if not until or until < clock.now():
        raise StepUpRequiredError("Step-up authentication required")
    return user
