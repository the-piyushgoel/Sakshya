"""
Standard error shapes and exception classes for Sakshya (§3.1).

All API errors MUST use one of the codes in VALID_CODES.
Error response shape:
    {"error": {"code": "<CODE>", "message": "...", "details": {}}}
"""
from fastapi import Request
from fastapi.responses import JSONResponse

# Canonical error codes (§3.1) — never add new ones without team sync
VALID_CODES = frozenset({
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "STEP_UP_REQUIRED",
    "SOD_VIOLATION",
    "NOT_FOUND",
    "VALIDATION_ERROR",
    "INVALID_STATE",
    "ELIGIBILITY_FAILED",
    "AMOUNT_MISMATCH",
    "VERIFY_NO_MATCH",
    "RATE_LIMITED",
    "DEPENDENCY_UNAVAILABLE",
})


class SakshyaError(Exception):
    """Base class for all Sakshya API errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 400,
        details: dict | None = None,
    ) -> None:
        if code not in VALID_CODES:
            raise ValueError(f"Unknown Sakshya error code: {code!r}")
        self.code    = code
        self.message = message
        self.status  = status
        self.details = details or {}
        super().__init__(message)


# ── Convenience subclasses ────────────────────────────────────────────────────

class UnauthenticatedError(SakshyaError):
    def __init__(self, msg: str = "Authentication required") -> None:
        super().__init__("UNAUTHENTICATED", msg, 401)


class ForbiddenError(SakshyaError):
    def __init__(self, msg: str = "Access denied") -> None:
        super().__init__("FORBIDDEN", msg, 403)


class StepUpRequiredError(SakshyaError):
    def __init__(self, msg: str = "Step-up authentication required") -> None:
        super().__init__("STEP_UP_REQUIRED", msg, 403)


class SodViolationError(SakshyaError):
    def __init__(self, rule: str = "") -> None:
        msg = f"Segregation of duties violation: {rule}" if rule else "Segregation of duties violation"
        super().__init__("SOD_VIOLATION", msg, 403)


class NotFoundError(SakshyaError):
    def __init__(self, entity: str, id: str = "") -> None:
        suffix = f": {id}" if id else ""
        super().__init__("NOT_FOUND", f"{entity} not found{suffix}", 404)


class ValidationError(SakshyaError):
    def __init__(self, msg: str, details: dict | None = None) -> None:
        super().__init__("VALIDATION_ERROR", msg, 422, details)


class InvalidStateError(SakshyaError):
    def __init__(self, msg: str) -> None:
        super().__init__("INVALID_STATE", msg, 409)


class EligibilityFailedError(SakshyaError):
    def __init__(self, msg: str, details: dict | None = None) -> None:
        super().__init__("ELIGIBILITY_FAILED", msg, 422, details)


class AmountMismatchError(SakshyaError):
    def __init__(self, msg: str = "Amount does not match letter") -> None:
        super().__init__("AMOUNT_MISMATCH", msg, 409)


class VerifyNoMatchError(SakshyaError):
    """
    Uniform no-match error for public verify — same body regardless of
    which field mismatched (prevents oracle attacks).
    """
    def __init__(self) -> None:
        super().__init__(
            "VERIFY_NO_MATCH",
            "The verification code, FDR number, or IFSC did not match any letter.",
            404,
        )


class RateLimitedError(SakshyaError):
    def __init__(self) -> None:
        super().__init__("RATE_LIMITED", "Too many requests. Please try again later.", 429)


# ── FastAPI exception handler ─────────────────────────────────────────────────

def sakshya_error_handler(request: Request, exc: SakshyaError) -> JSONResponse:  # noqa: ARG001
    return JSONResponse(
        status_code=exc.status,
        content={
            "error": {
                "code":    exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )

