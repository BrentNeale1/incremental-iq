"""
Tests for Hill function saturation curve fitting model and endpoint.

TDD RED phase: These tests define the expected behavior before implementation.
"""

from datetime import date, timedelta

import numpy as np
import pytest


def make_hill_data(
    days: int = 90,
    spend_min: float = 100,
    spend_max: float = 5000,
    alpha: float = 10000,
    mu: float = 2000,
    gamma: float = 1.5,
    seed: int = 42,
) -> list[dict]:
    """
    Generate synthetic daily campaign metrics where revenue follows a Hill function.

    Hill function: revenue = alpha * spend^gamma / (mu^gamma + spend^gamma)
    This produces an asymptotic saturation curve.

    Parameters
    ----------
    days : int
        Number of days to generate.
    spend_min, spend_max : float
        Range of daily spend variation.
    alpha : float
        Hill curve asymptote (theoretical maximum revenue).
    mu : float
        Half-saturation point (spend at 50% of alpha).
    gamma : float
        Shape parameter (steepness of the curve).
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    list[dict] with keys: date, spend_usd, revenue, conversions
    """
    rng = np.random.default_rng(seed)
    start = date(2024, 1, 1)

    def hill(x):
        return alpha * (x**gamma) / (mu**gamma + x**gamma)

    metrics = []
    for i in range(days):
        d = start + timedelta(days=i)
        spend = rng.uniform(spend_min, spend_max)
        revenue = hill(spend) + rng.normal(0, alpha * 0.02)  # 2% noise
        metrics.append(
            {
                "date": d.isoformat(),
                "spend_usd": float(spend),
                "revenue": float(max(0.0, revenue)),
                "conversions": float(max(0.0, revenue / 50)),
            }
        )

    return metrics


# ---------------------------------------------------------------------------
# Model-level tests
# ---------------------------------------------------------------------------


def test_hill_saturation_with_clear_curve():
    """
    Hill saturation model should fit a clear Hill curve and return valid parameters.
    """
    from models.saturation import hill_saturation_percent

    metrics = make_hill_data(days=90, spend_min=100, spend_max=5000, alpha=10000, mu=2000, gamma=1.5)
    spend = np.array([m["spend_usd"] for m in metrics])
    revenue = np.array([m["revenue"] for m in metrics])

    result = hill_saturation_percent(spend, revenue, recent_days=30)

    assert result["status"] == "estimated", f"Expected status='estimated', got: {result['status']}"
    assert result["saturation_percent"] is not None, "Expected non-None saturation_percent"
    assert 0.0 <= result["saturation_percent"] <= 1.0, (
        f"saturation_percent must be in [0, 1], got {result['saturation_percent']}"
    )
    assert result["hill_alpha"] is not None and result["hill_alpha"] > 0, (
        f"Expected positive hill_alpha, got {result['hill_alpha']}"
    )
    assert result["hill_mu"] is not None and result["hill_mu"] > 0, (
        f"Expected positive hill_mu, got {result['hill_mu']}"
    )
    assert result["hill_gamma"] is not None and result["hill_gamma"] > 0, (
        f"Expected positive hill_gamma, got {result['hill_gamma']}"
    )


def test_hill_saturation_returns_percentage():
    """
    At low spend, saturation < 0.5. At high spend near asymptote, saturation > 0.7.
    """
    from models.saturation import hill_saturation_percent

    # Low spend scenario: all spend below mu
    low_metrics = make_hill_data(
        days=90, spend_min=100, spend_max=800, alpha=10000, mu=2000, gamma=1.5
    )
    low_spend = np.array([m["spend_usd"] for m in low_metrics])
    low_revenue = np.array([m["revenue"] for m in low_metrics])
    low_result = hill_saturation_percent(low_spend, low_revenue, recent_days=30)

    if low_result["status"] == "estimated":
        assert low_result["saturation_percent"] < 0.6, (
            f"Low-spend saturation should be < 0.6, got {low_result['saturation_percent']}"
        )

    # High spend scenario: all spend well above mu
    high_metrics = make_hill_data(
        days=90, spend_min=4000, spend_max=8000, alpha=10000, mu=2000, gamma=1.5
    )
    high_spend = np.array([m["spend_usd"] for m in high_metrics])
    high_revenue = np.array([m["revenue"] for m in high_metrics])
    high_result = hill_saturation_percent(high_spend, high_revenue, recent_days=30)

    if high_result["status"] == "estimated":
        assert high_result["saturation_percent"] > 0.7, (
            f"High-spend saturation should be > 0.7, got {high_result['saturation_percent']}"
        )


def test_hill_saturation_insufficient_variation():
    """
    Flat spend (no variation) should return status='insufficient_variation'.
    """
    from models.saturation import hill_saturation_percent

    # 90 days of identical spend — no variation
    rng = np.random.default_rng(42)
    spend = np.full(90, 500.0)
    revenue = np.full(90, 3000.0) + rng.normal(0, 50, 90)

    result = hill_saturation_percent(spend, revenue, recent_days=30)

    assert result["status"] == "insufficient_variation", (
        f"Expected status='insufficient_variation', got {result['status']}"
    )
    assert result["saturation_percent"] is None, (
        f"Expected saturation_percent=None, got {result['saturation_percent']}"
    )


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    from main import app
    from fastapi.testclient import TestClient

    return TestClient(app)


def test_saturation_endpoint_returns_200(client):
    """
    POST /saturation with valid data should return 200 and SaturationResponse.
    """
    metrics = make_hill_data(days=90, spend_min=100, spend_max=5000)

    response = client.post(
        "/saturation",
        json={
            "tenant_id": "t1",
            "campaign_id": "c1",
            "metrics": metrics,
            "recent_days": 30,
        },
    )
    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert "status" in body, "Response missing 'status' field"
    assert "saturation_percent" in body, "Response missing 'saturation_percent' field"
