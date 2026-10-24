"""Pure risk scoring helpers for the Insights module."""

from __future__ import annotations

import math
from collections.abc import Mapping
from numbers import Real

from app.core.enums import InstrumentState
FACTOR_WEIGHTS: dict[str, float] = {
    "f_flags": 0.25,
    "f_aging": 0.20,
    "f_amount": 0.15,
    "f_maturity": 0.15,
    "f_bank": 0.10,
    "f_inst": 0.10,
    "f_recon": 0.05,
}

_FACTOR_LABELS = {
    "f_flags": "Document flags and discrepancies",
    "f_aging": "Time in current state",
    "f_amount": "Instrument amount",
    "f_maturity": "Maturity risk",
    "f_bank": "Bank response history",
    "f_inst": "Institute history",
    "f_recon": "Confirmation staleness",
}


def _contributions(
    factors: Mapping[str, Real],
    weights: Mapping[str, Real] | None,
) -> list[tuple[str, float, float]]:
    selected_weights = FACTOR_WEIGHTS if weights is None else weights
    expected = set(FACTOR_WEIGHTS)
    if set(factors) != expected:
        missing = sorted(expected - set(factors))
        unknown = sorted(set(factors) - expected)
        raise ValueError(f"factors must contain exactly the seven risk factors; missing={missing}, unknown={unknown}")
    if set(selected_weights) != expected:
        missing = sorted(expected - set(selected_weights))
        unknown = sorted(set(selected_weights) - expected)
        raise ValueError(f"weights must contain exactly the seven risk factors; missing={missing}, unknown={unknown}")

    validated_factors: dict[str, float] = {}
    validated_weights: dict[str, float] = {}
    for name in FACTOR_WEIGHTS:
        factor = factors[name]
        weight = selected_weights[name]
        if isinstance(factor, bool) or not isinstance(factor, Real) or not math.isfinite(factor):
            raise ValueError(f"{name} must be a finite number between 0 and 1")
        if not 0 <= factor <= 1:
            raise ValueError(f"{name} must be between 0 and 1")
        if isinstance(weight, bool) or not isinstance(weight, Real) or not math.isfinite(weight):
            raise ValueError(f"weight for {name} must be a finite non-negative number")
        if weight < 0:
            raise ValueError(f"weight for {name} must be non-negative")
        validated_factors[name] = float(factor)
        validated_weights[name] = float(weight)

    if not math.isclose(sum(validated_weights.values()), 1.0, rel_tol=0.0, abs_tol=1e-9):
        raise ValueError("risk weights must sum to 1.0")

    return [
        (name, validated_factors[name], validated_factors[name] * validated_weights[name])
        for name in FACTOR_WEIGHTS
    ]


def score(
    factors: Mapping[str, Real],
    weights: Mapping[str, Real] | None = None,
) -> int:
    """Return the weighted risk score, rounded to an integer from 0 to 100."""
    contributions = _contributions(factors, weights)
    return round(100 * sum(contribution for _, _, contribution in contributions))


def priority(
    risk_score: int,
    *,
    sla_breached: bool = False,
    due_in_days: Real | None = None,
) -> int:
    """Add urgency boosts to a risk score without clamping the resulting priority."""
    if isinstance(risk_score, bool) or not isinstance(risk_score, int) or not 0 <= risk_score <= 100:
        raise ValueError("risk_score must be an integer between 0 and 100")
    if not isinstance(sla_breached, bool):
        raise ValueError("sla_breached must be a boolean")
    if due_in_days is not None and (
        isinstance(due_in_days, bool)
        or not isinstance(due_in_days, Real)
        or not math.isfinite(due_in_days)
    ):
        raise ValueError("due_in_days must be a finite number or None")

    return risk_score + (20 if sla_breached else 0) + (
        10 if due_in_days is not None and due_in_days <= 2 else 0
    )


def explain(
    factors: Mapping[str, Real],
    weights: Mapping[str, Real] | None = None,
    *,
    details: Mapping[str, str] | None = None,
    limit: int = 3,
) -> list[str]:
    """Return the highest-contributing factor explanations in descending order."""
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0:
        raise ValueError("limit must be a non-negative integer")

    contributions = _contributions(factors, weights)
    if details is not None:
        unknown_details = set(details) - set(FACTOR_WEIGHTS)
        if unknown_details:
            raise ValueError(f"details contain unknown risk factors: {sorted(unknown_details)}")
        for name, detail in details.items():
            if not isinstance(detail, str) or not detail.strip():
                raise ValueError(f"detail for {name} must be a non-empty string")

    ranked = sorted(contributions, key=lambda item: item[2], reverse=True)
    explanations: list[str] = []
    for name, value, contribution in ranked[:limit]:
        if details is not None and name in details:
            explanations.append(details[name])
        else:
            explanations.append(
                f"{_FACTOR_LABELS[name]} (factor {value:.2f}; "
                f"{contribution * 100:.1f} risk points)"
            )
    return explanations


def maturity_factor(state: str | InstrumentState, days_to_maturity: Real | None) -> float:
    """Calculate maturity risk, treating LAPSED instruments as maximally risky."""
    state_value = getattr(state, "value", state)
    if state_value == "LAPSED":
        return 1.0
    if days_to_maturity is None or isinstance(days_to_maturity, bool) or not isinstance(days_to_maturity, Real):
        raise ValueError("days_to_maturity must be a finite number for non-lapsed instruments")
    if not math.isfinite(days_to_maturity):
        raise ValueError("days_to_maturity must be finite")
    if not 0 <= days_to_maturity <= 180:
        return 0.0
    return 1.0 - days_to_maturity / 180
