"""
In-memory sliding window rate limiter for public verification (§7.2, FR-REL-13).
Limits requests per IP address to 10 requests per 60-second window.
"""
from collections import defaultdict
import time

from fastapi import Request

from app.core.errors import RateLimitedError

_WINDOW_SECONDS = 60.0
_MAX_REQUESTS_PER_WINDOW = 10

# Map of client IP -> list of request timestamps
_ip_request_timestamps: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(request: Request) -> None:
    """
    Enforces a strict sliding-window rate limit on public endpoints.
    Allows up to 10 requests per minute per IP address.
    Exceeding the limit raises HTTP 429 RateLimitedError.
    """
    client_ip = "unknown"
    if request.client and request.client.host:
        client_ip = request.client.host

    # Check forward headers if present
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    now = time.time()
    cutoff = now - _WINDOW_SECONDS

    # Filter timestamps within sliding window
    timestamps = [t for t in _ip_request_timestamps[client_ip] if t > cutoff]

    if len(timestamps) >= _MAX_REQUESTS_PER_WINDOW:
        _ip_request_timestamps[client_ip] = timestamps
        raise RateLimitedError()

    timestamps.append(now)
    _ip_request_timestamps[client_ip] = timestamps


def reset_rate_limits() -> None:
    """Reset the in-memory rate limit counters (useful for unit and integration testing)."""
    _ip_request_timestamps.clear()
