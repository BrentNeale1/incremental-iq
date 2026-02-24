"""
FastAPI router for campaign incrementality scoring.

Exposes:
  POST /incrementality        — dual adjusted (CausalPy ITS) + raw (rolling mean) scores
  POST /incrementality/pooled — Bayesian hierarchical pooling for sparse campaigns
"""

import logging

import pandas as pd
from fastapi import APIRouter, HTTPException

from models.its import compute_incrementality, compute_raw_incrementality
from schemas.requests import IncrementalityRequest
from schemas.responses import IncrementalityResponse, IncrementalityScore

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=IncrementalityResponse)
async def incrementality_endpoint(request: IncrementalityRequest) -> IncrementalityResponse:
    """
    Compute dual incrementality scores for a campaign.

    Returns:
      - adjusted: CausalPy ITS Bayesian score with seasonal adjustment
      - raw: Rolling mean comparison without seasonal decomposition

    Per product decision: both perspectives are returned so users can see
    the full picture (STAT-02, STAT-03).
    """
    # Convert MetricRow list to DataFrame
    df = pd.DataFrame([m.model_dump() for m in request.metrics])
    df["date"] = pd.to_datetime(df["date"]).dt.date

    try:
        adjusted_dict = compute_incrementality(
            df,
            request.intervention_date,
            confidence_level=request.confidence_level,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to compute adjusted incrementality: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Adjusted incrementality computation failed: {exc}",
        ) from exc

    try:
        raw_dict = compute_raw_incrementality(
            df,
            request.intervention_date,
            confidence_level=request.confidence_level,
        )
    except Exception as exc:
        logger.exception("Failed to compute raw incrementality: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Raw incrementality computation failed: {exc}",
        ) from exc

    adjusted = IncrementalityScore(**adjusted_dict)
    raw = IncrementalityScore(**raw_dict)

    return IncrementalityResponse(adjusted=adjusted, raw=raw)


@router.post("/pooled")
async def pooled_incrementality_endpoint(request: dict) -> list:
    """
    Bayesian hierarchical pooling for sparse campaigns in a cluster.

    Sparse campaigns (< 30 data points) borrow strength from well-estimated
    campaigns in the same cluster, always returning a directional signal.

    Request shape:
      {
        "campaigns": [
          {
            "campaign_id": "...",
            "metrics": [...],
            "intervention_date": "YYYY-MM-DD",
            "data_points_count": N
          }
        ],
        "cluster_key": "meta-conversion"
      }
    """
    from models.hierarchical import hierarchical_pooled_estimate

    campaigns = request.get("campaigns", [])
    cluster_key = request.get("cluster_key", "default")

    if len(campaigns) < 2:
        # Fall back to individual estimation when only one campaign in cluster
        results = []
        for camp in campaigns:
            df = pd.DataFrame(camp["metrics"])
            df["date"] = pd.to_datetime(df["date"]).dt.date
            intervention_date_str = camp["intervention_date"]
            from datetime import date as date_type

            intervention_date = date_type.fromisoformat(intervention_date_str)
            try:
                individual = compute_incrementality(df, intervention_date)
                results.append(
                    {
                        "campaign_id": camp["campaign_id"],
                        "status": "scored",
                        **individual,
                    }
                )
            except ValueError:
                raw = compute_raw_incrementality(df, intervention_date)
                results.append(
                    {
                        "campaign_id": camp["campaign_id"],
                        "status": "pooled_estimate",
                        **raw,
                    }
                )
        return results

    try:
        return hierarchical_pooled_estimate(campaigns, cluster_key)
    except Exception as exc:
        logger.exception("Hierarchical pooling failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Hierarchical pooling failed: {exc}",
        ) from exc
