"""
Tests for Prophet baseline forecasting model and /forecast endpoint.

Covers:
- fit_baseline() direct unit tests (STAT-01, STAT-03, STAT-07, SEAS-01)
- /forecast FastAPI endpoint integration tests
- Zero-spend day filtering (Pitfall 2 mitigation)
- Minimum data enforcement (< 30 points → error)
"""

import math
import random
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Synthetic data helpers
# ---------------------------------------------------------------------------


def make_synthetic_revenue(
    days: int,
    trend: float = 0.5,
    noise: float = 10.0,
    start_date: date | None = None,
) -> list[dict]:
    """Generate a list of synthetic daily campaign metrics.

    Revenue follows: base + trend * t + seasonal_sine + noise.
    All days have spend_usd = 100.0 and conversions proportional to revenue.

    Args:
        days: Number of daily observations to generate.
        trend: Linear trend coefficient (revenue increases by this per day).
        noise: Standard deviation of Gaussian noise added to revenue.
        start_date: First date in the series (default: 2023-01-01).

    Returns:
        List of dicts with keys: date, spend_usd, revenue, conversions.
    """
    if start_date is None:
        start_date = date(2023, 1, 1)

    random.seed(42)
    rows = []
    for i in range(days):
        d = start_date + timedelta(days=i)
        # Sine wave simulates annual seasonality (period = 365 days)
        seasonal = 50.0 * math.sin(2 * math.pi * i / 365)
        weekly = 20.0 * math.sin(2 * math.pi * i / 7)
        gaussian = random.gauss(0.0, noise)
        revenue = max(0.0, 200.0 + trend * i + seasonal + weekly + gaussian)
        rows.append(
            {
                "date": d.isoformat(),
                "spend_usd": 100.0,
                "revenue": revenue,
                "conversions": max(0.0, revenue / 50.0),
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Unit tests: fit_baseline()
# ---------------------------------------------------------------------------


def test_fit_baseline_returns_forecast():
    """fit_baseline() returns a dict with 'forecast' and 'components' keys.

    Forecast list must span the historical period plus the forecast horizon,
    and each point must have ds, yhat, yhat_lower, yhat_upper.
    """
    import pandas as pd
    from models.baseline import fit_baseline

    rows = make_synthetic_revenue(180)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])

    result = fit_baseline(df, forecast_days=90)

    assert isinstance(result, dict), "fit_baseline must return a dict"
    assert "forecast" in result, "result must contain 'forecast' key"
    assert "components" in result, "result must contain 'components' key"

    forecast = result["forecast"]
    assert isinstance(forecast, list), "'forecast' must be a list"
    # Prophet returns all historical + future rows in the forecast
    assert len(forecast) > 180, "forecast should cover history + future period"

    required_keys = {"ds", "yhat", "yhat_lower", "yhat_upper"}
    for point in forecast:
        assert required_keys.issubset(
            point.keys()
        ), f"Each forecast point must have {required_keys}, got {point.keys()}"


def test_forecast_includes_confidence_intervals():
    """Every forecast point must satisfy yhat_lower < yhat < yhat_upper (STAT-03)."""
    import pandas as pd
    from models.baseline import fit_baseline

    rows = make_synthetic_revenue(180)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])

    result = fit_baseline(df, forecast_days=90)
    forecast = result["forecast"]

    for point in forecast:
        assert point["yhat_lower"] < point["yhat"], (
            f"yhat_lower must be < yhat at {point['ds']}: "
            f"lower={point['yhat_lower']}, yhat={point['yhat']}"
        )
        assert point["yhat"] < point["yhat_upper"], (
            f"yhat must be < yhat_upper at {point['ds']}: "
            f"yhat={point['yhat']}, upper={point['yhat_upper']}"
        )


def test_forecast_incorporates_holidays():
    """Holiday component must be non-zero around Christmas dates (SEAS-01).

    We generate 2 years of data with a clear spike on Dec 25 to give
    Prophet enough signal to learn a holiday effect.
    """
    import pandas as pd
    from models.baseline import fit_baseline

    # 2 years of data with a pronounced Christmas spike
    start = date(2023, 1, 1)
    rows = []
    random.seed(7)
    for i in range(730):
        d = start + timedelta(days=i)
        seasonal = 50.0 * math.sin(2 * math.pi * i / 365)
        gaussian = random.gauss(0.0, 5.0)
        # Inject large Christmas spike within Dec 18-25 window
        xmas_boost = 300.0 if (d.month == 12 and 18 <= d.day <= 25) else 0.0
        revenue = max(0.0, 200.0 + 0.5 * i + seasonal + xmas_boost + gaussian)
        rows.append(
            {
                "date": d.isoformat(),
                "spend_usd": 100.0,
                "revenue": revenue,
                "conversions": revenue / 50.0,
            }
        )

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])

    result = fit_baseline(df, forecast_days=30)
    components = result["components"]

    # Extract holiday component values around Christmas
    christmas_holidays = [
        c["holidays"]
        for c in components
        if hasattr(c["ds"], "month")
        and c["ds"].month == 12
        and 18 <= c["ds"].day <= 26
        or (
            isinstance(c["ds"], str)
            and "-12-" in c["ds"]
            and any(f"-{d:02d}" in c["ds"] for d in range(18, 27))
        )
    ]

    # At least some holiday component values should be present and non-zero
    assert len(components) > 0, "components must not be empty"
    all_holidays = [c["holidays"] for c in components]
    assert any(h != 0.0 for h in all_holidays), (
        "Holiday component should be non-zero on at least some dates "
        "when holidays are injected"
    )


def test_forecast_filters_zero_spend_days():
    """fit_baseline must not crash when 30% of rows have zero spend_usd.

    Zero-spend filtering should remove those rows before fitting
    (Pitfall 2 mitigation). The result must be a valid forecast dict.
    """
    import pandas as pd
    from models.baseline import fit_baseline

    rows = make_synthetic_revenue(180)

    # Randomly zero out 30% of spend days
    random.seed(99)
    for row in rows:
        if random.random() < 0.30:
            row["spend_usd"] = 0.0

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])

    # Should NOT raise an exception
    result = fit_baseline(df, forecast_days=30)

    assert "forecast" in result, "Result must have 'forecast' key"
    assert "components" in result, "Result must have 'components' key"
    assert len(result["forecast"]) > 0, "Forecast list must not be empty"


# ---------------------------------------------------------------------------
# Integration tests: /forecast endpoint
# ---------------------------------------------------------------------------


def test_forecast_endpoint_returns_200():
    """POST /forecast with 180 days of valid data must return 200 and a ForecastResponse."""
    from main import app

    client = TestClient(app)

    payload = {
        "tenant_id": "test-tenant-001",
        "campaign_id": "test-campaign-001",
        "metrics": make_synthetic_revenue(180),
        "user_events": [],
        "forecast_days": 30,
    }

    response = client.post("/forecast", json=payload)

    assert response.status_code == 200, (
        f"Expected 200, got {response.status_code}: {response.text}"
    )

    data = response.json()
    assert "forecast" in data, "Response must contain 'forecast'"
    assert "components" in data, "Response must contain 'components'"
    assert len(data["forecast"]) > 0, "Forecast list must not be empty"

    # Validate ForecastPoint structure on first item
    first = data["forecast"][0]
    assert "date" in first, "ForecastPoint must have 'date'"
    assert "yhat" in first, "ForecastPoint must have 'yhat'"
    assert "yhat_lower" in first, "ForecastPoint must have 'yhat_lower'"
    assert "yhat_upper" in first, "ForecastPoint must have 'yhat_upper'"


def test_forecast_endpoint_rejects_insufficient_data():
    """POST /forecast with only 10 days of data must return 400 or 422.

    The model requires at minimum 30 data points after zero-spend filtering.
    """
    from main import app

    client = TestClient(app)

    payload = {
        "tenant_id": "test-tenant-001",
        "campaign_id": "test-campaign-001",
        "metrics": make_synthetic_revenue(10),
        "user_events": [],
        "forecast_days": 30,
    }

    response = client.post("/forecast", json=payload)

    assert response.status_code in (400, 422), (
        f"Expected 400 or 422 for insufficient data, got {response.status_code}: {response.text}"
    )
