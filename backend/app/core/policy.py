"""
Policy Parameter Engine for Sakshya (§6.4).

Provides central configuration for regulatory rules, limits, timeouts, and risk thresholds.
Parameters are seeded with regulatory defaults and versioned in the database.
"""
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core import clock
from app.core.db import SessionLocal
from app.core.models import PolicyVersion

# Default policy parameter catalogue (§6.4)
DEFAULT_POLICIES: dict[str, Any] = {
    "deposit_term_years": 10,
    "amount_table": {
        "ENGINEERING_UG": 450000000,  # 45 Lakhs in integer paise
        "MANAGEMENT_PG": 250000000,   # 25 Lakhs
        "PHARMACY_UG": 200000000,     # 20 Lakhs
        "POLYTECHNIC": 150000000,     # 15 Lakhs
        "DEFAULT": 350000000,         # 35 Lakhs
    },
    "leased_multiplier": 2.0,
    "favouring_names": ["Member Secretary, AICTE"],
    "min_fdr_tenor_months": 12,
    "count_provisional_towards_coverage": False,
    "provisional_window_days": 30,
    "token_ttl_days": 30,
    "letter_validity_days": 14,
    "maturity_alert_days": [180, 90, 30, 7],
    "bank_reminder_days": [3, 7, 14],
    "escalation_days": [14, 21],
    "bank_request_timeout_days": 30,
    "recon_default_cadence": "QUARTERLY",
    "high_risk_threshold": 70,
    "recon_spot_check_pct": 2.0,
    "recon_freshness_days": 90,
    "penalty_rules": {
        "TERM_COMPLETE": 0,
        "DEFAULT": 10,
    },
    "interest_destination": {
        "beneficiary": "Member Secretary, AICTE",
        "account_number": "99990000123456",
        "bank_name": "State Bank of India",
        "ifsc": "SBIN0000001",
    },
    "approval_matrix": {
        "recommender": "APPROVING_OFFICER",
        "signatory": "RELEASE_AUTHORITY",
    },
    "release_case_types": ["TERM_COMPLETE"],
    "cash_deposit_enabled": False,
    "custody_log_days": 5,
    "retention_years": 10,
    "risk_weights": {
        "f_flags": 0.25,
        "f_aging": 0.20,
        "f_amount": 0.15,
        "f_maturity": 0.15,
        "f_bank": 0.10,
        "f_inst": 0.10,
        "f_recon": 0.05,
    },
    "upload_max_mb": 15,
    "otp_ttl_minutes": 10,
    "step_up_ttl_minutes": 5,
    "lapse_escalation_days": 15,
}

_policy_cache: dict[str, Any] = {}
_cache_initialized: bool = False


def reload_cache(db: Session | None = None) -> dict[str, Any]:
    """Reload policy cache from active PolicyVersion in the database."""
    global _policy_cache, _cache_initialized
    merged = dict(DEFAULT_POLICIES)

    try:
        session = db or SessionLocal()
        should_close = db is None
        try:
            active_version = (
                session.query(PolicyVersion)
                .filter(PolicyVersion.is_active == True)  # noqa: E712
                .order_by(PolicyVersion.version_number.desc())
                .first()
            )
            if active_version and active_version.parameters_json:
                merged.update(active_version.parameters_json)
        finally:
            if should_close:
                session.close()
    except Exception:
        pass

    _policy_cache = merged
    _cache_initialized = True
    return _policy_cache


def get(key: str, default: Any = None, db: Session | None = None) -> Any:
    """Retrieve a policy parameter by key with fallback."""
    global _cache_initialized
    if not _cache_initialized:
        reload_cache(db)

    if key in _policy_cache:
        return _policy_cache[key]

    return DEFAULT_POLICIES.get(key, default)


def get_all(db: Session | None = None) -> dict[str, Any]:
    """Retrieve full active policy parameter mapping."""
    global _cache_initialized
    if not _cache_initialized:
        reload_cache(db)
    return dict(_policy_cache)


def update_policies(new_params: dict[str, Any], db: Session) -> PolicyVersion:
    """
    Publish a new PolicyVersion by incrementing the version number
    and deactivating prior versions.
    """
    global _policy_cache, _cache_initialized

    latest = (
        db.query(PolicyVersion)
        .order_by(PolicyVersion.version_number.desc())
        .first()
    )
    next_ver = (latest.version_number + 1) if latest else 1

    # Deactivate existing active versions
    db.query(PolicyVersion).filter(PolicyVersion.is_active == True).update({"is_active": False})  # noqa: E712

    merged = dict(DEFAULT_POLICIES)
    if latest and latest.parameters_json:
        merged.update(latest.parameters_json)
    merged.update(new_params)

    new_version = PolicyVersion(
        id=str(uuid4()),
        version_number=next_ver,
        parameters_json=merged,
        created_at=clock.now(),
        is_active=True,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)

    _policy_cache = merged
    _cache_initialized = True
    return new_version

