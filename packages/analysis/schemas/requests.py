"""
Pydantic v2 request models for the Incremental IQ Analysis Engine.

Defines input contracts for all four statistical endpoints:
- /forecast     → ForecastRequest
- /incrementality → IncrementalityRequest
- /saturation   → SaturationRequest
- /anomalies    → AnomalyRequest
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class MetricRow(BaseModel):
    """A single daily observation of campaign performance metrics."""

    date: date
    spend_usd: float
    revenue: float
    conversions: float = 0.0


class HolidayEvent(BaseModel):
    """A user-defined event for the Prophet holiday calendar.

    Compatible with Prophet's holiday DataFrame format:
    - lower_window: days before the event date to include in holiday effect
    - upper_window: days after the event date to include in holiday effect
    """

    name: str
    date: date
    lower_window: int = 0
    upper_window: int = 0


class ForecastRequest(BaseModel):
    """Request for Prophet-based revenue/conversion forecast with retail seasonality.

    The engine will merge user_events with the pre-loaded retail event calendar
    before fitting the Prophet model.
    """

    tenant_id: str
    campaign_id: str
    metrics: list[MetricRow] = Field(
        ..., description="Historical daily metrics (minimum 30 rows recommended)"
    )
    user_events: list[HolidayEvent] = Field(
        default=[],
        description="Brand-specific events (flash sales, launches) to add to the holiday calendar",
    )
    forecast_days: int = Field(
        default=90, ge=1, le=365, description="Number of days to forecast ahead"
    )


class IncrementalityRequest(BaseModel):
    """Request for Bayesian incrementality scoring via Interrupted Time Series (ITS).

    Computes both seasonally-adjusted (CausalPy ITS + Prophet counterfactual) and
    raw (rolling mean comparison) incrementality scores.
    """

    tenant_id: str
    campaign_id: str
    metrics: list[MetricRow] = Field(
        ..., description="Historical daily metrics spanning pre- and post-intervention periods"
    )
    intervention_date: date = Field(
        ...,
        description="Date of budget change or campaign start — splits pre/post periods",
    )
    confidence_level: float = Field(
        default=0.94,
        ge=0.5,
        le=0.99,
        description="HDI probability for credible intervals (0.94 = 94% HDI)",
    )


class SaturationRequest(BaseModel):
    """Request for Hill saturation curve fitting to estimate diminishing returns.

    Requires spend variation in the metrics to fit the curve meaningfully.
    Returns the campaign's current position on the saturation curve as a percentage.
    """

    tenant_id: str
    campaign_id: str
    metrics: list[MetricRow] = Field(
        ...,
        description="Historical daily metrics — needs spend variation to fit Hill curve",
    )
    recent_days: int = Field(
        default=30,
        ge=7,
        le=180,
        description="Window for computing current average spend position on the curve",
    )


class AnomalyRequest(BaseModel):
    """Request for anomaly detection in campaign performance metrics.

    Uses seasonal decomposition + sigma-based thresholding to flag unexpected
    spikes/dips. Anomalies are flagged for user review, not auto-dampened.
    """

    tenant_id: str
    campaign_id: str
    metrics: list[MetricRow] = Field(
        ..., description="Historical daily metrics to scan for anomalies"
    )
    threshold_sigma: float = Field(
        default=2.5,
        ge=1.0,
        le=5.0,
        description="Standard deviations from expected for anomaly flagging",
    )
