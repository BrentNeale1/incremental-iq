"""
Tests for CausalPy Interrupted Time Series incrementality model and endpoint.

TDD RED phase: These tests define the expected behavior before implementation.
"""

from datetime import date, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient


def make_intervention_data(
    pre_days: int = 90,
    post_days: int = 30,
    lift_pct: float = 0.20,
    seed: int = 42,
) -> tuple[list[dict], date]:
    """
    Generate synthetic daily campaign metrics with a clear pre/post intervention.

    Pre-period: stable revenue trend with some noise.
    Post-period: revenue elevated by lift_pct above the pre-period mean.

    Returns (metrics_list, intervention_date).
    """
    rng = np.random.default_rng(seed)
    total_days = pre_days + post_days
    start = date(2024, 1, 1)

    pre_mean = 1000.0  # baseline daily revenue

    metrics = []
    for i in range(total_days):
        d = start + timedelta(days=i)
        is_post = i >= pre_days
        if is_post:
            revenue = pre_mean * (1 + lift_pct) + rng.normal(0, 50)
        else:
            revenue = pre_mean + rng.normal(0, 50)
        metrics.append(
            {
                "date": d.isoformat(),
                "spend_usd": 500.0 + rng.normal(0, 20),
                "revenue": max(0.0, revenue),
                "conversions": max(0.0, revenue / 50 + rng.normal(0, 1)),
            }
        )

    intervention_date = start + timedelta(days=pre_days)
    return metrics, intervention_date


def make_seasonal_data(
    pre_days: int = 90,
    post_days: int = 30,
    lift_pct: float = 0.20,
    seed: int = 99,
) -> tuple[list[dict], date]:
    """
    Generate synthetic data with strong weekly seasonality.
    Weekend revenue is 2x weekday revenue.
    """
    rng = np.random.default_rng(seed)
    total_days = pre_days + post_days
    start = date(2024, 3, 1)

    pre_mean = 1000.0

    metrics = []
    for i in range(total_days):
        d = start + timedelta(days=i)
        is_post = i >= pre_days
        # Strong weekly seasonality: weekends (Sat=5, Sun=6) are 2x
        weekday = d.weekday()
        seasonal_factor = 2.0 if weekday >= 5 else 1.0
        base = pre_mean * seasonal_factor
        if is_post:
            revenue = base * (1 + lift_pct) + rng.normal(0, 30)
        else:
            revenue = base + rng.normal(0, 30)
        metrics.append(
            {
                "date": d.isoformat(),
                "spend_usd": 500.0 + rng.normal(0, 20),
                "revenue": max(0.0, revenue),
                "conversions": max(0.0, revenue / 50),
            }
        )

    intervention_date = start + timedelta(days=pre_days)
    return metrics, intervention_date


# ---------------------------------------------------------------------------
# Model-level tests
# ---------------------------------------------------------------------------


def test_compute_incrementality_positive_lift():
    """
    ITS model on data with 20% lift should detect positive lift with credible intervals.
    """
    from models.its import compute_incrementality

    metrics, intervention_date = make_intervention_data(
        pre_days=90, post_days=30, lift_pct=0.20
    )
    import pandas as pd

    df = pd.DataFrame(metrics)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    result = compute_incrementality(df, intervention_date, confidence_level=0.94)

    assert result["lift_mean"] > 0, "Expected positive lift mean"
    assert (
        result["lift_lower"] < result["lift_mean"] < result["lift_upper"]
    ), "Expected lift_lower < lift_mean < lift_upper"
    assert (
        0.80 <= result["confidence"] <= 0.99
    ), f"Expected confidence in [0.80, 0.99], got {result['confidence']}"


def test_compute_incrementality_returns_counterfactual():
    """
    ITS model should return a counterfactual close to the pre-period mean,
    with post_period_mean > counterfactual_mean when there is a positive lift.
    """
    from models.its import compute_incrementality

    metrics, intervention_date = make_intervention_data(
        pre_days=90, post_days=30, lift_pct=0.20
    )
    import pandas as pd

    df = pd.DataFrame(metrics)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    result = compute_incrementality(df, intervention_date)

    pre_mean = result["pre_period_mean"]
    counterfactual = result["counterfactual_mean"]
    post_mean = result["post_period_mean"]

    # Counterfactual should be in the same ballpark as the pre-period mean
    # (within 50% — we're not being too strict here since ITS extrapolates trend)
    assert abs(counterfactual - pre_mean) / max(pre_mean, 1) < 0.5, (
        f"Counterfactual {counterfactual:.2f} is too far from pre_mean {pre_mean:.2f}"
    )
    # Post-period mean should exceed counterfactual given a 20% positive lift
    assert post_mean > counterfactual, (
        f"Expected post_period_mean ({post_mean:.2f}) > counterfactual_mean ({counterfactual:.2f})"
    )


def test_compute_incrementality_rejects_short_pre_period():
    """
    ITS model should raise ValueError when pre-period has fewer than 30 data points.
    """
    from models.its import compute_incrementality

    metrics, intervention_date = make_intervention_data(
        pre_days=15, post_days=15, lift_pct=0.10
    )
    import pandas as pd

    df = pd.DataFrame(metrics)
    df["date"] = pd.to_datetime(df["date"]).dt.date

    with pytest.raises(ValueError, match="pre.period|insufficient|minimum"):
        compute_incrementality(df, intervention_date)


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


def test_incrementality_endpoint_returns_200(client):
    """
    POST /incrementality with valid data should return 200 with adjusted and raw keys.
    """
    metrics, intervention_date = make_intervention_data(pre_days=90, post_days=30)

    response = client.post(
        "/incrementality",
        json={
            "tenant_id": "t1",
            "campaign_id": "c1",
            "metrics": metrics,
            "intervention_date": intervention_date.isoformat(),
            "confidence_level": 0.94,
        },
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    body = response.json()
    assert "adjusted" in body, "Response missing 'adjusted' key"
    assert "raw" in body, "Response missing 'raw' key"

    # Each should be parseable as IncrementalityScore shape
    for key in ("adjusted", "raw"):
        score = body[key]
        assert "lift_mean" in score, f"{key} missing lift_mean"
        assert "lift_lower" in score, f"{key} missing lift_lower"
        assert "lift_upper" in score, f"{key} missing lift_upper"
        assert "confidence" in score, f"{key} missing confidence"
        assert "diagnostics" in score, f"{key} missing diagnostics"


def test_incrementality_endpoint_includes_diagnostics(client):
    """
    Adjusted diagnostics should include r_hat and ess.
    Raw diagnostics should include method='rolling_mean_comparison'.
    """
    metrics, intervention_date = make_intervention_data(pre_days=90, post_days=30)

    response = client.post(
        "/incrementality",
        json={
            "tenant_id": "t1",
            "campaign_id": "c1",
            "metrics": metrics,
            "intervention_date": intervention_date.isoformat(),
        },
    )
    assert response.status_code == 200
    body = response.json()

    adj_diag = body["adjusted"]["diagnostics"]
    assert "r_hat" in adj_diag, f"adjusted.diagnostics missing r_hat: {adj_diag}"
    assert "ess" in adj_diag, f"adjusted.diagnostics missing ess: {adj_diag}"

    raw_diag = body["raw"]["diagnostics"]
    assert raw_diag.get("method") == "rolling_mean_comparison", (
        f"raw.diagnostics.method expected 'rolling_mean_comparison', got {raw_diag}"
    )


def test_raw_incrementality_no_seasonal_adjustment(client):
    """
    With strongly seasonal data, adjusted and raw lifts should differ.
    The adjusted score accounts for seasonality; the raw does not.
    """
    metrics, intervention_date = make_seasonal_data(
        pre_days=90, post_days=30, lift_pct=0.20
    )

    response = client.post(
        "/incrementality",
        json={
            "tenant_id": "t1",
            "campaign_id": "c1",
            "metrics": metrics,
            "intervention_date": intervention_date.isoformat(),
        },
    )
    assert response.status_code == 200
    body = response.json()

    adj_lift = body["adjusted"]["lift_mean"]
    raw_lift = body["raw"]["lift_mean"]

    # They should be different values (seasonality-adjustment changes the result)
    assert adj_lift != raw_lift, (
        f"Expected adjusted lift ({adj_lift}) to differ from raw lift ({raw_lift})"
    )
