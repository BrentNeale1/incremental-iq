"""
FastAPI router for Hill function saturation curve estimation.

Exposes:
  POST /saturation — fit Hill curve to campaign spend/revenue, return saturation %
"""

import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from models.saturation import hill_saturation_percent
from schemas.requests import SaturationRequest
from schemas.responses import SaturationResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=SaturationResponse)
async def saturation_endpoint(request: SaturationRequest) -> SaturationResponse:
    """
    Estimate saturation curve position for a campaign's current spend level.

    Fits a Hill function to historical spend/revenue data and computes
    what percentage of the theoretical maximum output the campaign has achieved.

    Returns SaturationResponse with saturation_percent in [0, 1] and status:
      - 'estimated': curve fit succeeded
      - 'insufficient_variation': spend is too flat to fit the curve (Pitfall 4)
      - 'error': curve fitting failed for other reasons
    """
    df = pd.DataFrame([m.model_dump() for m in request.metrics])

    if df.empty:
        raise HTTPException(status_code=400, detail="metrics list is empty")

    spend = df["spend_usd"].to_numpy(dtype=float)
    revenue = df["revenue"].to_numpy(dtype=float)

    try:
        result = hill_saturation_percent(spend, revenue, recent_days=request.recent_days)
    except Exception as exc:
        logger.exception("Saturation estimation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Saturation estimation failed: {exc}",
        ) from exc

    return SaturationResponse(
        saturation_percent=result.get("saturation_percent"),
        hill_alpha=result.get("hill_alpha"),
        hill_mu=result.get("hill_mu"),
        hill_gamma=result.get("hill_gamma"),
        status=result["status"],
        error=result.get("error"),
    )
