"""
POST /anomalies endpoint — STL-based anomaly detection for campaign metrics.

Accepts AnomalyRequest with historical daily metrics, returns AnomalyResponse
with detected anomalies, seasonal_strength, and trend_direction.

Anomalies are flagged for user review — NOT auto-dampened. Per product decision
from CONTEXT.md: users decide if a spike/dip is a PR mention, viral post, or
data error.

SEAS-02: Detect anomalies and seasonal patterns from historical campaign data.
"""

from fastapi import APIRouter, HTTPException

import pandas as pd

from schemas.requests import AnomalyRequest
from schemas.responses import AnomalyRecord, AnomalyResponse
from models.decompose import detect_anomalies

router = APIRouter()

# Minimum number of data points required for weekly STL decomposition
# STL period=7 requires at least 2 full cycles (14 points) to decompose
_MIN_DATA_POINTS = 14


@router.post("", response_model=AnomalyResponse)
async def detect_campaign_anomalies(request: AnomalyRequest) -> AnomalyResponse:
    """Detect anomalies in campaign revenue using STL seasonal decomposition.

    Args:
        request: AnomalyRequest with metrics (daily data), tenant_id,
                 campaign_id, and threshold_sigma.

    Returns:
        AnomalyResponse with:
        - anomalies: list of detected anomaly records (date, actual, expected,
                     deviation_sigma, direction)
        - seasonal_strength: [0, 1] measure of weekly seasonal pattern strength
        - trend_direction: 'increasing' | 'decreasing' | 'stable'

    Raises:
        HTTPException 400: when fewer than 14 data points are provided
                           (insufficient for weekly STL decomposition).
    """
    if len(request.metrics) < _MIN_DATA_POINTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient data: {len(request.metrics)} rows provided. "
                f"Minimum {_MIN_DATA_POINTS} days required for weekly STL decomposition "
                f"(at least 2 full weekly cycles)."
            ),
        )

    # Convert Pydantic request to DataFrame
    df = pd.DataFrame(
        [
            {
                "date": row.date.isoformat(),
                "spend_usd": row.spend_usd,
                "revenue": row.revenue,
                "conversions": row.conversions,
            }
            for row in request.metrics
        ]
    )
    df["date"] = pd.to_datetime(df["date"])

    # Run STL decomposition and anomaly detection
    result = detect_anomalies(df, threshold_sigma=request.threshold_sigma)

    # Convert anomaly dicts to Pydantic AnomalyRecord models
    anomaly_records = [
        AnomalyRecord(
            date=a["date"],
            actual=a["actual"],
            expected=a["expected"],
            deviation_sigma=a["deviation_sigma"],
            direction=a["direction"],
        )
        for a in result["anomalies"]
    ]

    return AnomalyResponse(
        anomalies=anomaly_records,
        seasonal_strength=result["seasonal_strength"],
        trend_direction=result["trend_direction"],
    )
