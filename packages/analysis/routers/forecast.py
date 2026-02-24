"""
Prophet forecast endpoint router.

POST /forecast accepts ForecastRequest and returns ForecastResponse.
Delegates to fit_baseline() in models.baseline.

Error handling:
- ValueError (insufficient data after filtering) → 400 Bad Request
- All other exceptions during fitting → 500 Internal Server Error
"""

from __future__ import annotations

import logging
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException

from models.baseline import fit_baseline
from schemas.requests import ForecastRequest
from schemas.responses import ForecastPoint, ForecastResponse, SeasonalComponent

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_date(ds) -> date:
    """Convert a Pandas Timestamp or datetime-like object to a Python date."""
    if hasattr(ds, "date"):
        return ds.date()
    return pd.Timestamp(ds).date()


@router.post("/", response_model=ForecastResponse)
async def create_forecast(request: ForecastRequest) -> ForecastResponse:
    """Generate a Prophet-based revenue forecast for a campaign.

    The model fits on the provided historical metrics, injects retail calendar
    events and any user-defined brand events as holidays, and returns a
    forward forecast with confidence intervals and seasonal decomposition.

    Args:
        request: ForecastRequest with tenant_id, campaign_id, metrics list,
                 optional user_events, and forecast_days horizon.

    Returns:
        ForecastResponse with forecast points and seasonal components.

    Raises:
        HTTPException 400: Insufficient data after zero-spend filtering.
        HTTPException 500: Prophet fitting or prediction failure.
    """
    logger.info(
        "Forecast request: tenant=%s campaign=%s metrics=%d days forecast_days=%d",
        request.tenant_id,
        request.campaign_id,
        len(request.metrics),
        request.forecast_days,
    )

    # Convert metrics list to DataFrame
    metrics_df = pd.DataFrame(
        [
            {
                "date": row.date,
                "spend_usd": float(row.spend_usd),
                "revenue": float(row.revenue),
                "conversions": float(row.conversions),
            }
            for row in request.metrics
        ]
    )

    # Convert user_events to dicts for baseline model
    user_events = None
    if request.user_events:
        user_events = [
            {
                "name": ev.name,
                "date": ev.date,
                "lower_window": ev.lower_window,
                "upper_window": ev.upper_window,
            }
            for ev in request.user_events
        ]

    # Fit and forecast
    try:
        result = fit_baseline(
            df=metrics_df,
            user_events=user_events,
            forecast_days=request.forecast_days,
        )
    except ValueError as exc:
        logger.warning("Forecast rejected — insufficient data: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Prophet fitting failed for campaign %s", request.campaign_id)
        raise HTTPException(
            status_code=500,
            detail=f"Forecast model fitting failed: {exc}",
        ) from exc

    # Map raw forecast dicts to Pydantic response models
    forecast_points = [
        ForecastPoint(
            date=_to_date(point["ds"]),
            yhat=point["yhat"],
            yhat_lower=point["yhat_lower"],
            yhat_upper=point["yhat_upper"],
        )
        for point in result["forecast"]
    ]

    seasonal_components = [
        SeasonalComponent(
            date=_to_date(comp["ds"]),
            trend=comp["trend"],
            yearly=comp["yearly"],
            weekly=comp["weekly"],
            holidays=comp.get("holidays", 0.0),
        )
        for comp in result["components"]
    ]

    return ForecastResponse(
        forecast=forecast_points,
        components=seasonal_components,
        model_params=result.get("model_params", {}),
    )
