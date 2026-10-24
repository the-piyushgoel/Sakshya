"""
Security utilities: password hashing (bcrypt) and JWT access tokens (§3.1).
"""
from datetime import timedelta
import os
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core import clock
from app.core.errors import UnauthenticatedError
from app.core.models import User

# Configuration
SECRET_KEY: str = os.getenv("SECRET_KEY", "sakshya-super-secret-jwt-key-minimum-32-chars-long")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS: int = 24


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    pw_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(user: User, expires_delta: timedelta | None = None) -> str:
    """Generate a signed JWT token containing user identity and role scopes."""
    now_dt = clock.now()
    if expires_delta:
        expire = now_dt + expires_delta
    else:
        expire = now_dt + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)

    claims = {
        "sub": user.id,
        "username": user.username,
        "roles": user.roles,
        "institute_id": user.institute_id,
        "bank_id": user.bank_id,
        "iat": int(now_dt.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as exc:
        raise UnauthenticatedError(f"Invalid or expired authentication token: {exc}") from exc

