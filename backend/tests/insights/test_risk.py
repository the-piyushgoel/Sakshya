import pytest

from app.core.enums import InstrumentState
from app.modules.insights.risk import FACTOR_WEIGHTS, explain, maturity_factor, priority, score


@pytest.mark.parametrize("factor_name", FACTOR_WEIGHTS)
@pytest.mark.parametrize("value", [0.0, 0.5, 1.0])
def test_score_accepts_each_factor_boundary(factor_name, value):
    factors = {name: 0.0 for name in FACTOR_WEIGHTS}
    factors[factor_name] = value

    result = score(factors)

    assert isinstance(result, int)
    assert 0 <= result <= 100


def test_default_weights_sum_to_one_and_full_risk_scores_100():
    assert sum(FACTOR_WEIGHTS.values()) == pytest.approx(1.0)
    assert score({name: 1.0 for name in FACTOR_WEIGHTS}) == 100
    assert score({name: 0.0 for name in FACTOR_WEIGHTS}) == 0


def test_score_uses_custom_normalized_weights():
    weights = {name: 0.0 for name in FACTOR_WEIGHTS}
    weights["f_aging"] = 1.0
    factors = {name: 0.0 for name in FACTOR_WEIGHTS}
    factors["f_aging"] = 0.75

    assert score(factors, weights) == 75


@pytest.mark.parametrize(
    "factors, weights",
    [
        ({}, None),
        ({**{name: 0.0 for name in FACTOR_WEIGHTS}, "extra": 0.0}, None),
        ({**{name: 0.0 for name in FACTOR_WEIGHTS}, "f_flags": 1.1}, None),
        ({**{name: 0.0 for name in FACTOR_WEIGHTS}, "f_flags": True}, None),
        ({name: 0.0 for name in FACTOR_WEIGHTS}, {name: 1.0 for name in FACTOR_WEIGHTS}),
    ],
)
def test_score_rejects_invalid_factors_or_weights(factors, weights):
    with pytest.raises(ValueError):
        score(factors, weights)


def test_priority_adds_sla_and_due_soon_boosts():
    assert priority(50) == 50
    assert priority(50, sla_breached=True) == 70
    assert priority(50, due_in_days=2) == 60
    assert priority(50, sla_breached=True, due_in_days=2) == 80
    assert priority(100, sla_breached=True, due_in_days=1) == 130
    assert priority(50, due_in_days=2.01) == 50


@pytest.mark.parametrize("risk_score", [-1, 101, True, 1.5])
def test_priority_rejects_invalid_scores(risk_score):
    with pytest.raises(ValueError):
        priority(risk_score)


def test_explain_returns_top_three_by_weighted_contribution():
    factors = {
        "f_flags": 0.5,
        "f_aging": 0.75,
        "f_amount": 1.0,
        "f_maturity": 0.0,
        "f_bank": 0.0,
        "f_inst": 0.0,
        "f_recon": 0.0,
    }

    reasons = explain(factors)

    assert reasons == [
        "Time in current state (factor 0.75; 15.0 risk points)",
        "Instrument amount (factor 1.00; 15.0 risk points)",
        "Document flags and discrepancies (factor 0.50; 12.5 risk points)",
    ]


def test_explain_preserves_factor_order_for_contribution_ties_and_uses_details():
    factors = {name: 0.0 for name in FACTOR_WEIGHTS}
    factors["f_flags"] = 1.0
    factors["f_aging"] = 1.0

    reasons = explain(factors, details={"f_flags": "HIGH flag D-11", "f_aging": "18 days in SCRUTINY"})

    assert reasons[:2] == ["HIGH flag D-11", "18 days in SCRUTINY"]
    assert len(reasons) == 3


def test_maturity_factor_handles_lapsed_and_maturity_window():
    assert maturity_factor(InstrumentState.LAPSED, None) == 1.0
    assert maturity_factor("ACTIVE", 12) == pytest.approx(1 - 12 / 180)
    assert maturity_factor("ACTIVE", 180) == 0.0
    assert maturity_factor("ACTIVE", 240) == 0.0
    assert maturity_factor("ACTIVE", -1) == 0.0


def test_maturity_factor_requires_days_for_non_lapsed_instrument():
    with pytest.raises(ValueError):
        maturity_factor(InstrumentState.ACTIVE, None)
