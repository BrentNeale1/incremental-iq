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
from schemas.responses import (
    IncrementalityResponse,
    IncrementalityScore,
    PooledIncrementalityResponse,
)

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


@router.post("/pooled", response_model=PooledIncrementalityResponse)
async def pooled_incrementality_endpoint(request: dict) -> dict:
    """
    Bayesian hierarchical pooling for sparse campaigns in a cluster.

    Sparse campaigns (< 30 data points) borrow strength from well-estimated
    campaigns in the same cluster, always returning a directional signal.

    Returns a structured response with:
      - adjusted: hierarchical pooled estimate for the target campaign
      - raw: direct compute_raw_incrementality on the target campaign's metrics
      - all_results: full list of results for all campaigns in the cluster

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
        "cluster_key": "meta-conversion",
        "target_campaign_id": "..."   # optional; identifies which campaign is the sparse target
      }
    """
    from datetime import date as date_type

    from models.hierarchical import hierarchical_pooled_estimate

    campaigns = request.get("campaigns", [])
    cluster_key = request.get("cluster_key", "default")
    target_campaign_id = request.get("target_campaign_id")

    # Determine the target campaign: prefer explicit target_campaign_id, fall back to is_target flag
    if not target_campaign_id:
        for camp in campaigns:
            if camp.get("is_target", False):
                target_campaign_id = camp["campaign_id"]
                break

    def _compute_raw_for_campaign(camp: dict) -> dict:
        """Compute raw incrementality for a single campaign dict. Returns raw_dict."""
        df = pd.DataFrame(camp["metrics"])
        df["date"] = pd.to_datetime(df["date"]).dt.date
        intervention_date = date_type.fromisoformat(camp["intervention_date"])
        return compute_raw_incrementality(df, intervention_date)

    def _build_response(
        adjusted_result: dict,
        raw_dict: dict,
        all_results: list[dict],
    ) -> dict:
        """Assemble the PooledIncrementalityResponse dict."""
        return {
            "adjusted": {
                "campaign_id": adjusted_result["campaign_id"],
                "lift_mean": adjusted_result["lift_mean"],
                "lift_lower": adjusted_result["lift_lower"],
                "lift_upper": adjusted_result["lift_upper"],
                "confidence": adjusted_result["confidence"],
                "status": adjusted_result.get("status", "pooled_estimate"),
            },
            "raw": {
                "campaign_id": adjusted_result["campaign_id"],
                "lift_mean": raw_dict["lift_mean"],
                "lift_lower": raw_dict["lift_lower"],
                "lift_upper": raw_dict["lift_upper"],
                "confidence": raw_dict["confidence"],
                "status": "pooled_estimate",
            },
            "all_results": all_results,
        }

    if len(campaigns) < 2:
        # Fall back to individual estimation when only one campaign in cluster
        results = []
        for camp in campaigns:
            df = pd.DataFrame(camp["metrics"])
            df["date"] = pd.to_datetime(df["date"]).dt.date
            intervention_date = date_type.fromisoformat(camp["intervention_date"])
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

        # Build dual response for the target campaign
        target_camp = next(
            (c for c in campaigns if c["campaign_id"] == target_campaign_id), None
        ) or (campaigns[0] if campaigns else None)

        if target_camp:
            target_result = next(
                (r for r in results if r["campaign_id"] == target_camp["campaign_id"]),
                results[0] if results else None,
            )
            if target_result:
                try:
                    raw_dict = _compute_raw_for_campaign(target_camp)
                except Exception:
                    raw_dict = {
                        "lift_mean": target_result["lift_mean"],
                        "lift_lower": target_result["lift_lower"],
                        "lift_upper": target_result["lift_upper"],
                        "confidence": target_result["confidence"] * 0.9,
                    }
                return _build_response(target_result, raw_dict, results)

        # Edge case: no campaigns at all — return empty-ish response
        raise HTTPException(status_code=400, detail="No campaigns provided")

    try:
        pooled_results = hierarchical_pooled_estimate(campaigns, cluster_key)
    except Exception as exc:
        logger.exception("Hierarchical pooling failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Hierarchical pooling failed: {exc}",
        ) from exc

    # Find the target campaign's pooled result (adjusted)
    target_result = next(
        (r for r in pooled_results if r["campaign_id"] == target_campaign_id),
        pooled_results[0] if pooled_results else None,
    )

    if target_result:
        target_camp = next(
            (c for c in campaigns if c["campaign_id"] == target_result["campaign_id"]),
            None,
        )
        if target_camp:
            try:
                raw_dict = _compute_raw_for_campaign(target_camp)
            except Exception:
                # Fallback: use pooled values with reduced confidence
                raw_dict = {
                    "lift_mean": target_result["lift_mean"],
                    "lift_lower": target_result["lift_lower"],
                    "lift_upper": target_result["lift_upper"],
                    "confidence": target_result["confidence"] * 0.9,
                }
            return _build_response(target_result, raw_dict, pooled_results)

    # Shouldn't reach here, but guard against edge cases
    raise HTTPException(
        status_code=500,
        detail="Could not identify target campaign in pooled results",
    )
