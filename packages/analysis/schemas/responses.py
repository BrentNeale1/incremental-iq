"""
Pydantic v2 response models for the Incremental IQ Analysis Engine.

Defines output contracts for all four statistical endpoints:
- /forecast       → ForecastResponse
- /incrementality → IncrementalityResponse
- /saturation     → SaturationResponse
- /anomalies      → AnomalyResponse
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class ForecastPoint(BaseModel):
    """A single day's forecast output from Prophet."""

    date: date
    yhat: float = Field(..., description="Predicted value (point estimate)")
    yhat_lower: float = Field(..., description="Lower bound of confidence interval")
    yhat_upper: float = Field(..., description="Upper bound of confidence interval")


class SeasonalComponent(BaseModel):
    """Decomposed seasonal components from Prophet for a single day."""

    date: date
    trend: float = Field(..., description="Long-term trend component")
    yearly: float = Field(..., description="Annual seasonality component")
    weekly: float = Field(..., description="Day-of-week seasonality component")
    holidays: float = Field(
        default=0.0,
        description="Holiday/event effect component (0 when no holiday influence)",
    )


class ForecastResponse(BaseModel):
    """Prophet forecast with seasonal decomposition for the requested horizon."""

    forecast: list[ForecastPoint] = Field(
        ..., description="Daily forecast points for the requested forecast_days horizon"
    )
    components: list[SeasonalComponent] = Field(
        ..., description="Decomposed seasonality components for the same date range"
    )
    model_params: dict = Field(
        default={},
        description="Prophet model parameters stored for debugging and reproducibility",
    )


class IncrementalityScore(BaseModel):
    """Bayesian incrementality score for a single measurement approach.

    lift_mean/lower/upper are expressed as multipliers (1.2 = 20% lift).
    cumulative_lift is the total revenue/conversion gain over the post-period.
    """

    lift_mean: float = Field(
        ..., description="Posterior mean lift multiplier (e.g., 1.2 = 20% lift)"
    )
    lift_lower: float = Field(..., description="Lower bound of HDI credible interval")
    lift_upper: float = Field(..., description="Upper bound of HDI credible interval")
    confidence: float = Field(
        ..., description="HDI probability used (matches request confidence_level)"
    )
    cumulative_lift: float = Field(
        ...,
        description="Total incremental revenue/conversions over the post-intervention period",
    )
    pre_period_mean: float = Field(
        ..., description="Average daily outcome in the pre-intervention period"
    )
    post_period_mean: float = Field(
        ..., description="Average daily outcome in the post-intervention period"
    )
    counterfactual_mean: float = Field(
        ...,
        description="Predicted average daily outcome without the intervention (synthetic control)",
    )
    diagnostics: dict = Field(
        default={},
        description="Model quality diagnostics: R-hat convergence, effective sample size (ESS)",
    )


class IncrementalityResponse(BaseModel):
    """Dual incrementality scores: seasonally-adjusted and raw.

    Per product decision: both perspectives are returned so users can see the full picture.
    - adjusted: CausalPy Interrupted Time Series with Prophet counterfactual (accounts for seasonality)
    - raw: Rolling mean comparison without seasonal decomposition (simple before/after)
    """

    adjusted: IncrementalityScore = Field(
        ...,
        description="Seasonally-adjusted score via CausalPy ITS with Prophet counterfactual baseline",
    )
    raw: IncrementalityScore = Field(
        ...,
        description="Unadjusted score via rolling mean comparison (no seasonal decomposition)",
    )


class SaturationResponse(BaseModel):
    """Hill curve saturation estimate for the campaign's current spend level.

    saturation_percent is None when fitting failed (see status for reason).
    Hill function: f(x) = x^alpha / (gamma^alpha + x^alpha) * mu
    """

    saturation_percent: Optional[float] = Field(
        default=None,
        description="Current spend position on the Hill curve (0.0 = no saturation, 1.0 = fully saturated)",
    )
    hill_alpha: Optional[float] = Field(
        default=None, description="Hill curve shape parameter (steepness)"
    )
    hill_mu: Optional[float] = Field(
        default=None, description="Hill curve maximum achievable outcome (ceiling)"
    )
    hill_gamma: Optional[float] = Field(
        default=None,
        description="Hill curve half-saturation point (spend level at 50% of maximum)",
    )
    status: str = Field(
        ...,
        description="Fitting status: 'estimated' | 'insufficient_variation' | 'error'",
    )
    error: Optional[str] = Field(
        default=None, description="Error message when status is 'error'"
    )


class AnomalyRecord(BaseModel):
    """A single detected anomaly in campaign performance."""

    date: date
    actual: float = Field(..., description="Observed metric value on this date")
    expected: float = Field(
        ..., description="Model-predicted expected value for this date"
    )
    deviation_sigma: float = Field(
        ..., description="How many standard deviations the actual deviates from expected"
    )
    direction: str = Field(
        ..., description="'spike' (actual > expected) or 'dip' (actual < expected)"
    )


class AnomalyResponse(BaseModel):
    """Anomaly detection results with seasonal context.

    Anomalies are flagged for user review — users decide if each is a real signal
    (PR mention, viral post) or a data error. Not auto-dampened.
    """

    anomalies: list[AnomalyRecord] = Field(
        ..., description="All detected anomalies exceeding threshold_sigma"
    )
    seasonal_strength: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Measure of how seasonal the data is (0 = no seasonality, 1 = fully seasonal)",
    )
    trend_direction: str = Field(
        ...,
        description="Overall trend: 'increasing' | 'decreasing' | 'stable'",
    )
