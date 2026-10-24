"""
Background job registry hooks for the monitoring module (§1.3, §7.8).
"""
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core import jobs
from app.modules.monitoring.service import scan_maturities


def maturity_scan_handler(db: Session, now_dt: datetime) -> dict[str, Any]:
    """Background job executing periodic maturity and lapse scans."""
    return scan_maturities(db, now_dt)


def register_jobs() -> None:
    """Register monitoring jobs in the central job registry."""
    jobs.register("maturity_scan", maturity_scan_handler)


# Auto-register upon import
register_jobs()

