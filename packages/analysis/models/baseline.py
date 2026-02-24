"""
Prophet-based baseline forecasting model with retail event calendar integration.

Provides fit_baseline() which:
- Filters zero-spend days (> 20% threshold) before fitting
- Injects retail calendar events as Prophet holidays
- Merges user-defined brand events into the holiday calendar
- Returns forecast with confidence intervals and decomposed components

Usage:
    import pandas as pd
    from models.baseline import fit_baseline

    df = pd.read_csv("campaign_metrics.csv")  # must have 'date', 'spend_usd', 'revenue' columns
    result = fit_baseline(df, forecast_days=90)
    # result: {"forecast": [...], "components": [...], "model_params": {...}}
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from prophet import Prophet

from data.retail_calendar import get_retail_events, to_prophet_holidays

logger = logging.getLogger(__name__)

# Minimum number of data points required after zero-spend filtering
MIN_DATA_POINTS = 30

# Threshold ratio: if more than this fraction of rows have zero spend, filter them
ZERO_SPEND_FILTER_THRESHOLD = 0.20


def _build_holidays_df(
    start_year: int,
    end_year: int,
    user_events: list[dict] | None = None,
) -> pd.DataFrame:
    """Construct a Prophet-compatible holidays DataFrame.

    Merges retail calendar events with optional user-defined brand events.

    Args:
        start_year: First year to include retail events for.
        end_year: Last year to include retail events for.
        user_events: Optional list of brand event dicts with keys:
            name, date, lower_window, upper_window. Compatible with HolidayEvent schema.

    Returns:
        pd.DataFrame with columns [holiday, ds, lower_window, upper_window].
    """
    retail_events = get_retail_events(start_year, end_year)
    all_events = list(retail_events)

    if user_events:
        for event in user_events:
            # Accept both dict and Pydantic-like objects (with .model_dump() or attribute access)
            if hasattr(event, "model_dump"):
                event = event.model_dump()
            all_events.append(
                {
                    "holiday": event.get("name", "custom_event"),
                    "ds": pd.to_datetime(event["date"]),
                    "lower_window": event.get("lower_window", 0),
                    "upper_window": event.get("upper_window", 0),
                }
            )

    return to_prophet_holidays(all_events)


def _filter_zero_spend(df: pd.DataFrame) -> pd.DataFrame:
    """Remove zero-spend rows when they exceed the filter threshold.

    Only filters if zero-spend rows exceed ZERO_SPEND_FILTER_THRESHOLD fraction
    of all rows. Some campaigns have legitimate zero-spend days (weekends) and
    aggressive filtering would distort the signal.

    Args:
        df: DataFrame with a 'spend_usd' column.

    Returns:
        Filtered DataFrame (or original if below threshold).
    """
    if "spend_usd" not in df.columns:
        return df

    total_rows = len(df)
    zero_rows = (df["spend_usd"] == 0).sum()
    zero_fraction = zero_rows / total_rows if total_rows > 0 else 0.0

    if zero_fraction > ZERO_SPEND_FILTER_THRESHOLD:
        logger.info(
            "Filtering %d zero-spend rows (%.1f%% of data) before Prophet fit",
            zero_rows,
            zero_fraction * 100,
        )
        return df[df["spend_usd"] != 0].copy()

    return df


def fit_baseline(
    df: pd.DataFrame,
    user_events: list[dict] | None = None,
    forecast_days: int = 90,
) -> dict[str, Any]:
    """Fit a Prophet baseline model to campaign revenue data.

    Produces a forecast with confidence intervals and decomposes the signal
    into trend, yearly, weekly, and holiday components.

    Args:
        df: Historical campaign metrics. Required columns:
            - 'date' (datetime-like): observation date
            - 'revenue' (float): outcome to forecast
            Optional: 'spend_usd' (float) for zero-spend filtering.
        user_events: Optional list of brand events to add to the holiday calendar.
            Each dict should have: name, date, lower_window (default 0), upper_window (default 0).
        forecast_days: Number of days to forecast beyond the historical data.

    Returns:
        Dict with:
            - 'forecast': list of {ds, yhat, yhat_lower, yhat_upper} per day
            - 'components': list of {ds, trend, yearly, weekly, holidays} per day
            - 'model_params': dict of Prophet hyperparameters for reproducibility

    Raises:
        ValueError: If fewer than MIN_DATA_POINTS rows remain after filtering.
    """
    # --- Validate and prepare input ---
    if "date" not in df.columns:
        raise ValueError("DataFrame must have a 'date' column")
    if "revenue" not in df.columns:
        raise ValueError("DataFrame must have a 'revenue' column")

    # --- Zero-spend filtering ---
    filtered_df = _filter_zero_spend(df)

    if len(filtered_df) < MIN_DATA_POINTS:
        raise ValueError(
            f"Insufficient data: {len(filtered_df)} rows after zero-spend filtering "
            f"(minimum {MIN_DATA_POINTS} required). "
            f"Provide more historical data or reduce the zero-spend ratio."
        )

    # --- Build Prophet input (ds, y) ---
    prophet_df = pd.DataFrame(
        {
            "ds": pd.to_datetime(filtered_df["date"]),
            "y": filtered_df["revenue"].astype(float),
        }
    ).reset_index(drop=True)

    # --- Determine year range for retail calendar ---
    min_year = prophet_df["ds"].dt.year.min()
    max_year = prophet_df["ds"].dt.year.max() + 1  # include one forward year
    holidays_df = _build_holidays_df(
        start_year=int(min_year),
        end_year=int(max_year),
        user_events=user_events,
    )

    # --- Configure Prophet ---
    # multiplicative seasonality: revenue scales with trend (not additive offset)
    model_params = {
        "seasonality_mode": "multiplicative",
        "yearly_seasonality": True,
        "weekly_seasonality": True,
        "daily_seasonality": False,
    }

    model = Prophet(
        holidays=holidays_df,
        **model_params,
    )

    # Suppress verbose Stan output
    import logging as _logging
    _logging.getLogger("cmdstanpy").setLevel(_logging.WARNING)
    _logging.getLogger("prophet").setLevel(_logging.WARNING)

    # --- Fit ---
    model.fit(prophet_df)

    # --- Forecast ---
    future_df = model.make_future_dataframe(periods=forecast_days, freq="D")
    forecast_df = model.predict(future_df)

    # --- Extract components ---
    component_cols = ["ds", "trend"]
    if "yearly" in forecast_df.columns:
        component_cols.append("yearly")
    if "weekly" in forecast_df.columns:
        component_cols.append("weekly")
    # holidays component may be named 'holidays' or individual event names
    if "holidays" in forecast_df.columns:
        component_cols.append("holidays")

    components = []
    for _, row in forecast_df[component_cols].iterrows():
        comp = {
            "ds": row["ds"],
            "trend": float(row.get("trend", 0.0)),
            "yearly": float(row.get("yearly", 0.0)),
            "weekly": float(row.get("weekly", 0.0)),
            "holidays": float(row.get("holidays", 0.0)),
        }
        components.append(comp)

    # --- Build forecast list ---
    forecast_records = []
    for _, row in forecast_df[["ds", "yhat", "yhat_lower", "yhat_upper"]].iterrows():
        forecast_records.append(
            {
                "ds": row["ds"],
                "yhat": float(row["yhat"]),
                "yhat_lower": float(row["yhat_lower"]),
                "yhat_upper": float(row["yhat_upper"]),
            }
        )

    return {
        "forecast": forecast_records,
        "components": components,
        "model_params": model_params,
    }
