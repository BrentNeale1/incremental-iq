"""
Hill function saturation curve fitting for campaign spend-to-outcome modeling.

Estimates what percentage of theoretical maximum output a campaign has reached
given its current spend level. Uses scipy curve_fit for deterministic fitting.

Hill function: f(x) = alpha * x^gamma / (mu^gamma + x^gamma)
  - alpha: asymptote (theoretical maximum revenue/conversions)
  - mu: half-saturation point (spend at 50% of alpha)
  - gamma: steepness/shape parameter

RESEARCH.md Pitfall 4: Requires minimum coefficient of variation (CV >= 0.15)
in spend data to reliably fit the curve. Returns 'insufficient_variation' status
when CV is too low.
"""

from typing import Optional

import numpy as np
from scipy.optimize import curve_fit


# Minimum coefficient of variation required to fit the Hill curve reliably.
# CV = std(spend) / mean(spend). Below this threshold, spend is effectively flat
# and the Hill function parameters cannot be identified.
MIN_CV = 0.15


def _hill(x: np.ndarray, alpha: float, mu: float, gamma: float) -> np.ndarray:
    """Hill saturation function: alpha * x^gamma / (mu^gamma + x^gamma)."""
    return alpha * (x**gamma) / (mu**gamma + x**gamma)


def hill_saturation_percent(
    spend_series: np.ndarray,
    revenue_series: np.ndarray,
    recent_days: int = 30,
) -> dict:
    """
    Fit a Hill saturation curve to spend vs revenue data and compute the
    current campaign's position on the curve as a percentage.

    Parameters
    ----------
    spend_series : np.ndarray
        Daily spend values (in USD). Must have len >= 1.
    revenue_series : np.ndarray
        Daily revenue values matching spend_series.
    recent_days : int
        Window for computing current average spend position (default 30).
        Uses the last `recent_days` entries in spend_series.

    Returns
    -------
    dict with keys:
        saturation_percent : Optional[float]
            Current spend position as fraction of theoretical maximum [0, 1].
            None when fitting fails.
        hill_alpha : Optional[float]
            Fitted asymptote parameter (theoretical maximum output).
        hill_mu : Optional[float]
            Fitted half-saturation spend level.
        hill_gamma : Optional[float]
            Fitted steepness parameter.
        status : str
            'estimated' | 'insufficient_variation' | 'error'
        error : Optional[str]
            Error message when status='error'.
    """
    spend_series = np.asarray(spend_series, dtype=float)
    revenue_series = np.asarray(revenue_series, dtype=float)

    # Pitfall 4: Check coefficient of variation (CV) of spend
    spend_mean = np.mean(spend_series)
    spend_std = np.std(spend_series)
    if spend_mean > 0:
        cv = spend_std / spend_mean
    else:
        cv = 0.0

    if cv < MIN_CV:
        return {
            "saturation_percent": None,
            "hill_alpha": None,
            "hill_mu": None,
            "hill_gamma": None,
            "status": "insufficient_variation",
            "error": None,
        }

    # Initial guesses from RESEARCH.md:
    # alpha ~ max revenue seen, mu ~ median spend, gamma ~ 1.0
    alpha_init = float(np.max(revenue_series))
    mu_init = float(np.median(spend_series))
    gamma_init = 1.0

    if alpha_init <= 0:
        alpha_init = 1.0
    if mu_init <= 0:
        mu_init = float(np.mean(spend_series)) or 1.0

    try:
        popt, _ = curve_fit(
            _hill,
            spend_series,
            revenue_series,
            p0=[alpha_init, mu_init, gamma_init],
            bounds=([0, 0, 0.1], [np.inf, np.inf, 5.0]),
            maxfev=10000,
        )
        alpha_fit, mu_fit, gamma_fit = popt
    except RuntimeError as exc:
        return {
            "saturation_percent": None,
            "hill_alpha": None,
            "hill_mu": None,
            "hill_gamma": None,
            "status": "error",
            "error": f"curve_fit did not converge: {exc}",
        }
    except ValueError as exc:
        return {
            "saturation_percent": None,
            "hill_alpha": None,
            "hill_mu": None,
            "hill_gamma": None,
            "status": "error",
            "error": f"curve_fit value error: {exc}",
        }

    # Current spend = mean of the last `recent_days` entries
    recent_spend = spend_series[-recent_days:] if len(spend_series) >= recent_days else spend_series
    current_spend = float(np.mean(recent_spend))

    # Saturation percentage = hill(current_spend) / alpha
    current_output = _hill(current_spend, alpha_fit, mu_fit, gamma_fit)
    saturation_pct = float(current_output / alpha_fit) if alpha_fit > 0 else 0.0

    # Clamp to [0, 1] — numerical edge cases can push slightly outside
    saturation_pct = max(0.0, min(1.0, saturation_pct))

    return {
        "saturation_percent": saturation_pct,
        "hill_alpha": float(alpha_fit),
        "hill_mu": float(mu_fit),
        "hill_gamma": float(gamma_fit),
        "status": "estimated",
        "error": None,
    }
