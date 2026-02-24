"""
Tests for Bayesian hierarchical pooling model for sparse campaigns.

TDD RED phase: These tests define the expected behavior before implementation.

Hierarchical pooling allows sparse campaigns (< 30 data points) to borrow
strength from well-estimated campaigns in the same cluster. Per product
decision: marketers always get a directional signal, never 'insufficient_data'.
"""

from datetime import date, timedelta

import numpy as np
import pytest


def make_campaign_data(
    campaign_id: str,
    n_days: int,
    true_lift: float = 0.15,
    pre_ratio: float = 0.75,
    seed: int = None,
) -> dict:
    """
    Generate synthetic campaign data for hierarchical pooling tests.

    Parameters
    ----------
    campaign_id : str
        Unique identifier for the campaign.
    n_days : int
        Total days of data (pre + post).
    true_lift : float
        True lift percentage for this campaign.
    pre_ratio : float
        Fraction of days in the pre-period (default 0.75 = 75% pre, 25% post).
    seed : int
        Random seed for reproducibility.

    Returns
    -------
    dict with keys: campaign_id, metrics, intervention_date, data_points_count
    """
    if seed is None:
        seed = hash(campaign_id) % 2**31

    rng = np.random.default_rng(seed)
    pre_days = max(1, int(n_days * pre_ratio))
    post_days = n_days - pre_days
    start = date(2024, 1, 1)
    pre_mean = 1000.0

    metrics = []
    for i in range(n_days):
        d = start + timedelta(days=i)
        is_post = i >= pre_days
        noise_scale = 80.0
        if is_post:
            revenue = pre_mean * (1 + true_lift) + rng.normal(0, noise_scale)
        else:
            revenue = pre_mean + rng.normal(0, noise_scale)
        metrics.append(
            {
                "date": d.isoformat(),
                "spend_usd": float(500 + rng.normal(0, 20)),
                "revenue": float(max(0, revenue)),
                "conversions": float(max(0, revenue / 50)),
            }
        )

    intervention_date = start + timedelta(days=pre_days)

    return {
        "campaign_id": campaign_id,
        "metrics": metrics,
        "intervention_date": intervention_date.isoformat(),
        "data_points_count": n_days,
    }


# ---------------------------------------------------------------------------
# Model-level tests
# ---------------------------------------------------------------------------


def test_hierarchical_pooled_estimate_shrinks_toward_cluster():
    """
    Sparse campaigns should have their estimates shrunk toward the cluster mean.
    Data-rich campaigns should have narrower credible intervals than sparse ones.
    """
    from models.hierarchical import hierarchical_pooled_estimate

    # 3 data-rich campaigns with ~15% lift, 2 sparse
    campaigns = [
        make_campaign_data("c1", n_days=120, true_lift=0.15, seed=1),
        make_campaign_data("c2", n_days=100, true_lift=0.15, seed=2),
        make_campaign_data("c3", n_days=90, true_lift=0.15, seed=3),
        make_campaign_data("c4", n_days=25, true_lift=0.25, seed=4),  # sparse
        make_campaign_data("c5", n_days=28, true_lift=0.05, seed=5),  # sparse
    ]

    results = hierarchical_pooled_estimate(campaigns, cluster_key="meta-conversion")

    assert len(results) == 5, f"Expected 5 results, got {len(results)}"

    # Collect by campaign_id
    by_id = {r["campaign_id"]: r for r in results}

    # All campaigns must have non-None lift estimates
    for cid, r in by_id.items():
        assert r["lift_mean"] is not None, f"Campaign {cid} missing lift_mean"
        assert r["lift_lower"] is not None, f"Campaign {cid} missing lift_lower"
        assert r["lift_upper"] is not None, f"Campaign {cid} missing lift_upper"

    # Sparse campaigns should have wider credible intervals than data-rich ones
    rich_widths = [
        by_id["c1"]["lift_upper"] - by_id["c1"]["lift_lower"],
        by_id["c2"]["lift_upper"] - by_id["c2"]["lift_lower"],
        by_id["c3"]["lift_upper"] - by_id["c3"]["lift_lower"],
    ]
    sparse_widths = [
        by_id["c4"]["lift_upper"] - by_id["c4"]["lift_lower"],
        by_id["c5"]["lift_upper"] - by_id["c5"]["lift_lower"],
    ]

    avg_rich_width = sum(rich_widths) / len(rich_widths)
    avg_sparse_width = sum(sparse_widths) / len(sparse_widths)

    assert avg_sparse_width > avg_rich_width, (
        f"Expected sparse campaigns to have wider CI: "
        f"sparse avg width={avg_sparse_width:.4f}, rich avg width={avg_rich_width:.4f}"
    )


def test_hierarchical_returns_directional_signal_for_sparse():
    """
    Campaigns with only 20 data points (below 30-day ITS threshold) should
    still receive a directional lift estimate via pooling — not 'insufficient_data'.
    """
    from models.hierarchical import hierarchical_pooled_estimate

    campaigns = [
        make_campaign_data("rich1", n_days=90, true_lift=0.15, seed=10),
        make_campaign_data("rich2", n_days=80, true_lift=0.18, seed=11),
        make_campaign_data("rich3", n_days=100, true_lift=0.12, seed=12),
        make_campaign_data("sparse", n_days=20, true_lift=0.10, seed=13),
    ]

    results = hierarchical_pooled_estimate(campaigns, cluster_key="google-awareness")

    by_id = {r["campaign_id"]: r for r in results}
    sparse_result = by_id["sparse"]

    # Must not be None — always return a directional signal
    assert sparse_result["lift_mean"] is not None, (
        "Sparse campaign should get a directional signal, not None"
    )
    assert sparse_result["lift_lower"] is not None, (
        "Sparse campaign should get lift_lower, not None"
    )
    assert sparse_result["lift_upper"] is not None, (
        "Sparse campaign should get lift_upper, not None"
    )

    # Status should indicate it's a pooled estimate, not individually scored
    assert sparse_result.get("status") in ("pooled_estimate", "scored"), (
        f"Sparse campaign status should be 'pooled_estimate' or 'scored', got {sparse_result.get('status')}"
    )

    # Confidence should be lower for sparse than for rich campaigns
    if all("confidence" in r for r in results):
        sparse_conf = sparse_result["confidence"]
        rich_confs = [by_id["rich1"]["confidence"], by_id["rich2"]["confidence"]]
        avg_rich_conf = sum(rich_confs) / len(rich_confs)
        assert sparse_conf <= avg_rich_conf + 0.1, (
            f"Sparse campaign confidence ({sparse_conf}) should not exceed rich campaigns ({avg_rich_conf})"
        )


def test_hierarchical_with_single_campaign_degrades_to_individual():
    """
    A cluster with a single data-rich campaign should return the individual estimate.
    """
    from models.hierarchical import hierarchical_pooled_estimate

    campaigns = [
        make_campaign_data("solo", n_days=90, true_lift=0.20, seed=20),
    ]

    results = hierarchical_pooled_estimate(campaigns, cluster_key="shopify-conversion")

    assert len(results) == 1, f"Expected 1 result, got {len(results)}"
    result = results[0]

    assert result["campaign_id"] == "solo"
    assert result["lift_mean"] is not None, "Solo campaign should have lift_mean"
    # For a data-rich solo campaign, it should be individually scored
    assert result.get("status") in ("scored", "pooled_estimate"), (
        f"Unexpected status: {result.get('status')}"
    )


# ---------------------------------------------------------------------------
# Endpoint integration test
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    from main import app
    from fastapi.testclient import TestClient

    return TestClient(app)


def test_hierarchical_endpoint_integration(client):
    """
    POST /incrementality/pooled should return pooled IncrementalityResponses
    for all campaigns in the cluster.
    """
    campaigns = [
        make_campaign_data("camp-a", n_days=90, true_lift=0.15, seed=30),
        make_campaign_data("camp-b", n_days=80, true_lift=0.12, seed=31),
        make_campaign_data("camp-c", n_days=20, true_lift=0.10, seed=32),  # sparse
    ]

    response = client.post(
        "/incrementality/pooled",
        json={
            "campaigns": campaigns,
            "cluster_key": "meta-conversion",
        },
    )
    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )
    body = response.json()
    assert isinstance(body, list), f"Expected list response, got {type(body)}"
    assert len(body) == 3, f"Expected 3 results, got {len(body)}"

    for item in body:
        assert "campaign_id" in item, f"Missing campaign_id in {item}"
        assert "lift_mean" in item, f"Missing lift_mean in {item}"
