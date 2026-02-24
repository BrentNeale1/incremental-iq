"""
Pre-loaded retail event calendar for Prophet holiday integration.

Provides 12 major US/global retail events with date computation for any year range.
Output format is directly compatible with Prophet's holiday DataFrame.

Usage:
    from data.retail_calendar import get_retail_events, to_prophet_holidays

    events = get_retail_events(2023, 2026)
    holidays_df = to_prophet_holidays(events)
    model = Prophet(holidays=holidays_df)
"""

from datetime import date, timedelta
from typing import Any

import pandas as pd


def _easter_date(year: int) -> date:
    """Compute Easter Sunday using the Anonymous Gregorian algorithm."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date:
    """Find the nth occurrence of a weekday in a given month.

    Args:
        year: Calendar year
        month: Calendar month (1-12)
        weekday: Day of week (0=Monday, 6=Sunday — Python convention)
        n: Which occurrence (1=first, 2=second, 3=third, 4=fourth)
    """
    first_day = date(year, month, 1)
    # How many days until we reach the target weekday?
    days_until = (weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=days_until)
    return first_occurrence + timedelta(weeks=n - 1)


def _last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    """Find the last occurrence of a weekday in a given month.

    Args:
        year: Calendar year
        month: Calendar month (1-12)
        weekday: Day of week (0=Monday, 6=Sunday — Python convention)
    """
    if month == 12:
        last_day = date(year, 12, 31)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)

    days_back = (last_day.weekday() - weekday) % 7
    return last_day - timedelta(days=days_back)


def _black_friday(year: int) -> date:
    """Black Friday: day after Thanksgiving (4th Thursday of November)."""
    thanksgiving = _nth_weekday_of_month(year, 11, 3, 4)  # 3=Thursday
    return thanksgiving + timedelta(days=1)


def _cyber_monday(year: int) -> date:
    """Cyber Monday: Monday after Black Friday."""
    bf = _black_friday(year)
    days_until_monday = (0 - bf.weekday()) % 7  # 0=Monday
    if days_until_monday == 0:
        days_until_monday = 7
    return bf + timedelta(days=days_until_monday)


def _mothers_day(year: int) -> date:
    """Mother's Day: 2nd Sunday of May."""
    return _nth_weekday_of_month(year, 5, 6, 2)  # 6=Sunday


def _fathers_day(year: int) -> date:
    """Father's Day: 3rd Sunday of June."""
    return _nth_weekday_of_month(year, 6, 6, 3)  # 6=Sunday


def _labor_day(year: int) -> date:
    """Labor Day (US): 1st Monday of September."""
    return _nth_weekday_of_month(year, 9, 0, 1)  # 0=Monday


def _memorial_day(year: int) -> date:
    """Memorial Day: last Monday of May."""
    return _last_weekday_of_month(year, 5, 0)  # 0=Monday


# Retail event definitions: each entry specifies name, date function, and Prophet windows.
# lower_window: days BEFORE the event date captured in holiday effect (negative direction)
# upper_window: days AFTER the event date captured in holiday effect (positive direction)
_RETAIL_EVENTS = [
    {
        "holiday": "Black Friday",
        "date_fn": _black_friday,
        "lower_window": 3,  # BF deals start Wed-Thu
        "upper_window": 1,  # Saturday deals continue
    },
    {
        "holiday": "Cyber Monday",
        "date_fn": _cyber_monday,
        "lower_window": 0,
        "upper_window": 1,  # Cyber Tuesday deals
    },
    {
        "holiday": "Christmas",
        "date_fn": lambda y: date(y, 12, 25),
        "lower_window": 7,  # Pre-Christmas shopping week
        "upper_window": 1,  # Post-Christmas sales
    },
    {
        "holiday": "New Year",
        "date_fn": lambda y: date(y, 1, 1),
        "lower_window": 1,  # New Year's Eve
        "upper_window": 1,  # New Year's Day deals
    },
    {
        "holiday": "Valentine's Day",
        "date_fn": lambda y: date(y, 2, 14),
        "lower_window": 1,  # Feb 13 gift buying
        "upper_window": 0,
    },
    {
        "holiday": "Mother's Day",
        "date_fn": _mothers_day,
        "lower_window": 2,  # Pre-holiday gift buying
        "upper_window": 0,
    },
    {
        "holiday": "Father's Day",
        "date_fn": _fathers_day,
        "lower_window": 2,  # Pre-holiday gift buying
        "upper_window": 0,
    },
    {
        "holiday": "Prime Day",
        # Amazon Prime Day is typically mid-July; using Jul 12 as estimate.
        # Users can override with the actual date via user_events in ForecastRequest.
        "date_fn": lambda y: date(y, 7, 12),
        "lower_window": 0,
        "upper_window": 1,  # Prime Day is typically 2 days; window_after covers day 2
    },
    {
        "holiday": "Back to School",
        # Back to School is a multi-week period; Aug 1 as anchor with wide windows.
        "date_fn": lambda y: date(y, 8, 1),
        "lower_window": 7,  # Late July run-up
        "upper_window": 7,  # Through mid-August
    },
    {
        "holiday": "Easter",
        "date_fn": _easter_date,
        "lower_window": 2,  # Good Friday and Saturday
        "upper_window": 0,
    },
    {
        "holiday": "Labor Day Sales",
        "date_fn": _labor_day,
        "lower_window": 1,  # Pre-Labor Day weekend deals
        "upper_window": 0,
    },
    {
        "holiday": "Memorial Day Sales",
        "date_fn": _memorial_day,
        "lower_window": 1,  # Pre-Memorial Day weekend deals
        "upper_window": 0,
    },
]


def get_retail_events(start_year: int, end_year: int) -> list[dict[str, Any]]:
    """Generate retail event instances for a range of years.

    Returns a list of event dicts compatible with Prophet's holidays DataFrame format:
    - holiday (str): event name
    - ds (date): event anchor date
    - lower_window (int): days before ds captured in holiday effect
    - upper_window (int): days after ds captured in holiday effect

    Args:
        start_year: First year to generate events for (inclusive)
        end_year: Last year to generate events for (inclusive)

    Returns:
        List of event dicts, one per event per year.

    Example:
        events = get_retail_events(2024, 2026)
        # Returns 36 events: 12 events × 3 years
    """
    events = []
    for year in range(start_year, end_year + 1):
        for event_def in _RETAIL_EVENTS:
            try:
                event_date = event_def["date_fn"](year)
                events.append(
                    {
                        "holiday": event_def["holiday"],
                        "ds": event_date,
                        "lower_window": event_def["lower_window"],
                        "upper_window": event_def["upper_window"],
                    }
                )
            except Exception:
                # Skip events that can't be computed for a given year (edge cases)
                continue

    return events


def to_prophet_holidays(events: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert event dicts to Prophet's expected holidays DataFrame format.

    Prophet expects a DataFrame with columns: holiday, ds, lower_window, upper_window.
    - ds must be datetime64 (Prophet converts date objects automatically, but being explicit avoids warnings)

    Args:
        events: List of event dicts from get_retail_events() or custom events.

    Returns:
        pd.DataFrame with columns [holiday, ds, lower_window, upper_window].

    Example:
        events = get_retail_events(2024, 2026)
        holidays_df = to_prophet_holidays(events)
        model = Prophet(holidays=holidays_df)
    """
    if not events:
        return pd.DataFrame(columns=["holiday", "ds", "lower_window", "upper_window"])

    df = pd.DataFrame(events)
    df["ds"] = pd.to_datetime(df["ds"])

    # Prophet requires lower_window <= 0 (negative = days before the event date).
    # Event dicts store lower_window as a positive integer (human-readable "days before").
    # Negate here so Prophet receives the expected signed convention.
    df["lower_window"] = -df["lower_window"].abs()

    return df[["holiday", "ds", "lower_window", "upper_window"]].reset_index(drop=True)
