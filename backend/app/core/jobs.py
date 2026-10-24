"""
In-process background job registry and scheduled tick runner (§1.3, §3.5).

Used for time-travel demos to trigger periodic tasks (maturity scans, SLA checks,
bank timeouts) via POST /admin/tick and /admin/clock/advance with idempotent deduplication.
"""
from collections.abc import Callable
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core import clock
from app.core.models import JobRun

JobHandler = Callable[[Session, datetime], dict[str, Any] | None]

_registry: dict[str, JobHandler] = {}


def register(name: str, fn: JobHandler) -> None:
    """Register a background job handler function by name."""
    _registry[name] = fn


def unregister(name: str) -> None:
    """Unregister a job handler by name."""
    _registry.pop(name, None)


def list_jobs() -> list[str]:
    """List names of all registered background jobs in registration order."""
    return list(_registry.keys())


def clear_registry() -> None:
    """Clear all registered jobs and restore default system heartbeat."""
    _registry.clear()
    register("system_heartbeat", _default_heartbeat_job)


def _default_heartbeat_job(db: Session, now_dt: datetime) -> dict[str, Any]:
    """Default baseline job ensuring tick runner always executes at least one check."""
    return {"status": "healthy", "simulated_time": now_dt.isoformat()}


# Register default system heartbeat on import
register("system_heartbeat", _default_heartbeat_job)


def run_all(db: Session, force: bool = False) -> list[dict[str, Any]]:
    """
    Execute all registered background jobs in order.

    Each job execution is recorded in the `job_runs` table with a time-based
    deduplication key. Multiple ticks within the same time step are idempotently
    skipped unless force=True.
    """
    now_dt = clock.now()
    # Deduplicate per minute in simulated time
    time_slot = now_dt.strftime("%Y-%m-%d_%H:%M")

    results: list[dict[str, Any]] = []

    for job_name, job_fn in list(_registry.items()):
        dedupe_key = f"{job_name}:{time_slot}"

        existing = (
            db.query(JobRun)
            .filter(JobRun.dedupe_key == dedupe_key)
            .first()
        )

        if existing and not force and existing.status == "SUCCESS":
            results.append({
                "job_name": job_name,
                "status": "SKIPPED",
                "details": {"reason": "Already executed for this time step", "run_id": existing.id},
            })
            continue

        try:
            details = job_fn(db, now_dt) or {}
            if existing:
                existing.ran_at = now_dt
                existing.status = "SUCCESS"
                existing.details_json = details
            else:
                run_rec = JobRun(
                    job_name=job_name,
                    dedupe_key=dedupe_key,
                    ran_at=now_dt,
                    status="SUCCESS",
                    details_json=details,
                )
                db.add(run_rec)
            db.commit()
            results.append({
                "job_name": job_name,
                "status": "SUCCESS",
                "details": details,
            })
        except Exception as exc:
            db.rollback()
            if existing:
                existing.ran_at = now_dt
                existing.status = "FAILED"
                existing.details_json = {"error": str(exc)}
            else:
                fail_rec = JobRun(
                    job_name=job_name,
                    dedupe_key=dedupe_key,
                    ran_at=now_dt,
                    status="FAILED",
                    details_json={"error": str(exc)},
                )
                db.add(fail_rec)
            db.commit()
            results.append({
                "job_name": job_name,
                "status": "FAILED",
                "details": {"error": str(exc)},
            })

    return results

