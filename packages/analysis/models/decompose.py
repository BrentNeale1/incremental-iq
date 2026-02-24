"""
STL-based seasonal decomposition and residual anomaly detection.

Uses statsmodels STL (Seasonal-Trend decomposition using LOESS) to decompose
a campaign revenue time series into trend, seasonal, and residual components.
Anomalies are identified as dates where |residual| > threshold_sigma * sigma.

Per user decision: anomalies are flagged for review, NOT auto-dampened.
Pitfall 5 mitigation: callers should apply 3-day smoothing before detection
if billing cycle false positives are a concern (handled in budget-detection.ts).

SEAS-02: Detect anomalies (unexpected spikes/dips) and seasonal patterns
from historical campaign data.
"""

import numpy as np
import pandas as pd
from statsmodels.tsa.seasonal import STL


def detect_anomalies(df: pd.DataFrame, threshold_sigma: float = 2.5) -> dict:
    """Detect anomalies in campaign revenue using STL decomposition.

    Implementation follows RESEARCH.md code example closely:
    - Sets date as index, uses 'revenue' column as the time series
    - Applies STL with period=7 (weekly), seasonal=13 (robust seasonal window), robust=True
    - Extracts residuals, computes sigma = std(residuals)
    - Finds anomalies where |residual| > threshold_sigma * sigma
    - Computes seasonal_strength = 1 - (var(resid) / var(seasonal + resid))
    - Computes trend_direction: compare first 30 days vs last 30 days trend means

    Args:
        df: DataFrame with columns ['date', 'revenue'] (date as datetime-typed column).
        threshold_sigma: Number of standard deviations above which a residual is an anomaly.

    Returns:
        dict with keys:
            - anomalies: list of AnomalyRecord dicts (date, actual, expected, deviation_sigma, direction)
            - seasonal_strength: float in [0, 1] (0 = no seasonality, 1 = fully seasonal)
            - trend_direction: 'increasing' | 'decreasing' | 'stable'
    """
    # Set date as index and extract the revenue series
    series = df.set_index("date")["revenue"].astype(float)
    series.index = pd.to_datetime(series.index)

    # Sort by date to ensure proper time ordering
    series = series.sort_index()

    # Apply STL decomposition:
    # period=7: weekly seasonality (7-day cycle in ad campaign data)
    # seasonal=13: seasonal window (odd number >= 7, robust smoother size)
    # robust=True: downweights outliers when estimating trend/seasonal components
    stl = STL(series, period=7, seasonal=13, robust=True)
    result = stl.fit()

    residuals = result.resid
    trend = result.trend
    seasonal = result.seasonal
    sigma = float(residuals.std())

    # Compute seasonal_strength: fraction of variance explained by seasonality
    # Formula: 1 - var(resid) / var(seasonal + resid)
    # Range: [0, 1]. Near 1 = strong weekly pattern. Near 0 = mostly noise.
    var_resid = float(np.var(residuals))
    var_seasonal_plus_resid = float(np.var(seasonal + residuals))
    if var_seasonal_plus_resid > 0:
        seasonal_strength = float(1.0 - var_resid / var_seasonal_plus_resid)
        # Clamp to [0, 1] to handle numerical edge cases
        seasonal_strength = max(0.0, min(1.0, seasonal_strength))
    else:
        seasonal_strength = 0.0

    # Compute trend_direction: compare first 30 vs last 30 days trend means
    # If last 30 mean is >5% higher than first 30 mean -> 'increasing'
    # If last 30 mean is >5% lower -> 'decreasing', otherwise 'stable'
    n = len(trend)
    window = min(30, n // 3)  # guard against very short series
    first_mean = float(trend.iloc[:window].mean())
    last_mean = float(trend.iloc[-window:].mean())

    if first_mean != 0:
        pct_change = (last_mean - first_mean) / abs(first_mean)
    else:
        pct_change = 0.0

    if pct_change > 0.05:
        trend_direction = "increasing"
    elif pct_change < -0.05:
        trend_direction = "decreasing"
    else:
        trend_direction = "stable"

    # Identify anomaly dates: |residual| > threshold_sigma * sigma
    if sigma == 0:
        # All residuals are zero (perfectly smooth data) — no anomalies
        anomaly_mask = pd.Series(False, index=residuals.index)
    else:
        anomaly_mask = residuals.abs() > threshold_sigma * sigma

    anomaly_dates = residuals[anomaly_mask].index

    # Build anomaly records
    # expected = trend + seasonal (reconstructed without residual)
    anomalies = []
    for anomaly_date in anomaly_dates:
        actual = float(series[anomaly_date])
        residual_val = float(residuals[anomaly_date])
        expected = float(actual - residual_val)  # = trend + seasonal at this date
        deviation_sigma = float(residual_val / sigma)
        direction = "spike" if residual_val > 0 else "dip"

        anomalies.append(
            {
                "date": anomaly_date.date().isoformat(),
                "actual": actual,
                "expected": expected,
                "deviation_sigma": deviation_sigma,
                "direction": direction,
            }
        )

    return {
        "anomalies": anomalies,
        "seasonal_strength": seasonal_strength,
        "trend_direction": trend_direction,
    }
