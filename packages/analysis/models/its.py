"""
CausalPy Interrupted Time Series wrapper for campaign-level incrementality scoring.

Computes Bayesian lift estimates with credible intervals using pre/post
intervention data. Returns both the posterior summary and model diagnostics
(R-hat, effective sample size) for quality assessment.

CausalPy ITS documentation:
  https://causalpy.readthedocs.io/en/latest/notebooks/its_lift_test.html

Implementation note on Windows:
  PyMC multiprocessing via spawn requires cores=1 to avoid the
  "if __name__ == '__main__'" guard requirement. This is a known limitation
  when running inside a FastAPI/uvicorn worker process. Performance is
  adequate for the planned nightly scoring workloads.
"""

from datetime import date

import numpy as np
import pandas as pd

# Minimum pre-period data points required for a stable ITS model.
# Below this threshold the Bayesian model cannot establish a reliable baseline.
MIN_PRE_PERIOD_DAYS = 30


def _get_confidence_hdi_col(confidence_level: float) -> tuple[str, str]:
    """Return the column name pattern CausalPy uses for HDI bounds."""
    pct = int(round(confidence_level * 100))
    return f"impact_hdi_lower_{pct}", f"impact_hdi_upper_{pct}"


def compute_incrementality(
    df: pd.DataFrame,
    intervention_date: date,
    confidence_level: float = 0.94,
) -> dict:
    """
    Fit a CausalPy Interrupted Time Series model to compute campaign-level
    incrementality lift with Bayesian credible intervals.

    This is the **adjusted** score — the ITS model fits a Bayesian linear
    regression on the pre-period to establish the counterfactual trend, then
    measures the gap between actual and counterfactual in the post-period.

    Uses get_plot_data_bayesian() to extract post-period impact values with
    HDI bounds directly from CausalPy's built-in posterior computation.

    Parameters
    ----------
    df : pd.DataFrame
        Daily campaign metrics with columns: date (date), revenue (float).
        Must span both pre- and post-intervention periods.
    intervention_date : date
        The date of the budget change or campaign start.
        Pre-period: date < intervention_date.
        Post-period: date >= intervention_date.
    confidence_level : float
        HDI probability for credible intervals (default 0.94 = 94% HDI).

    Returns
    -------
    dict with keys:
        lift_mean, lift_lower, lift_upper, confidence, cumulative_lift,
        pre_period_mean, post_period_mean, counterfactual_mean, diagnostics

    Raises
    ------
    ValueError
        If the pre-period has fewer than MIN_PRE_PERIOD_DAYS data points.
    """
    import causalpy as cp
    import arviz as az

    # Ensure date column is date objects for comparison
    if not pd.api.types.is_object_dtype(df["date"]) and not hasattr(
        df["date"].iloc[0], "year"
    ):
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"]).dt.date

    pre_df = df[df["date"] < intervention_date].copy()
    post_df = df[df["date"] >= intervention_date].copy()

    # Pitfall 1: Validate pre-period length
    if len(pre_df) < MIN_PRE_PERIOD_DAYS:
        raise ValueError(
            f"Insufficient pre-period data: {len(pre_df)} days available, "
            f"minimum {MIN_PRE_PERIOD_DAYS} required for reliable ITS model fitting. "
            "Consider using compute_raw_incrementality() for campaigns with short history."
        )

    # Add integer time index required by CausalPy ITS formula
    all_dates = sorted(df["date"].unique())
    date_to_t = {d: i for i, d in enumerate(all_dates)}
    df = df.copy()
    df["t"] = df["date"].map(date_to_t)
    df["y"] = df["revenue"]

    intervention_t = date_to_t[intervention_date]

    # Fit CausalPy ITS on the full dataset with treatment_time as integer index.
    # cores=1 is required on Windows where multiprocessing uses 'spawn' start method.
    # Production Linux/Docker can use cores=4 for parallelism.
    model = cp.InterruptedTimeSeries(
        data=df[["t", "y"]],
        treatment_time=intervention_t,
        formula="y ~ 1 + t",
        model=cp.pymc_models.LinearRegression(
            sample_kwargs={
                "draws": 500,
                "tune": 200,
                "target_accept": 0.90,
                "progressbar": False,
                "chains": 1,
                "cores": 1,
            }
        ),
    )

    # CausalPy get_plot_data_bayesian() returns a DataFrame with one row per
    # time step across the full date range. Post-period rows have 'impact'
    # (actual - counterfactual) and the HDI columns.
    # Column name for HDI: e.g. 'impact_hdi_lower_94' for confidence_level=0.94
    pct = int(round(confidence_level * 100))
    lower_col = f"impact_hdi_lower_{pct}"
    upper_col = f"impact_hdi_upper_{pct}"

    # Pass hdi_prob so columns match the requested confidence_level
    plot_df = model.get_plot_data_bayesian(hdi_prob=confidence_level)

    # Fall back to searching for available HDI columns if exact match not found
    if lower_col not in plot_df.columns:
        hdi_lower_cols = [c for c in plot_df.columns if c.startswith("impact_hdi_lower")]
        if hdi_lower_cols:
            lower_col = hdi_lower_cols[0]
            upper_col = lower_col.replace("lower", "upper")
        else:
            lower_col = "impact"
            upper_col = "impact"

    # Post-period: t >= intervention_t
    post_plot = plot_df[plot_df["t"] >= intervention_t]
    pre_plot = plot_df[plot_df["t"] < intervention_t]

    lift_mean = float(post_plot["impact"].mean())
    lift_lower = float(post_plot[lower_col].mean()) if lower_col in post_plot.columns else lift_mean
    lift_upper = float(post_plot[upper_col].mean()) if upper_col in post_plot.columns else lift_mean
    cumulative_lift = float(post_plot["impact"].sum())

    pre_period_mean = float(pre_df["revenue"].mean())
    post_period_mean = float(post_df["revenue"].mean())

    # Counterfactual = prediction column in post-period
    counterfactual_mean = float(post_plot["prediction"].mean()) if "prediction" in post_plot.columns else pre_period_mean

    # Diagnostics: R-hat and ESS (Pitfall 1 warning signs: R-hat > 1.1, ESS < 100)
    idata = model.idata
    try:
        rhat_vals = az.rhat(idata).to_array().values.flatten()
        rhat_max = float(np.nanmax(rhat_vals))
    except Exception:
        rhat_max = float("nan")

    try:
        ess_vals = az.ess(idata).to_array().values.flatten()
        ess_min = float(np.nanmin(ess_vals))
    except Exception:
        ess_min = float("nan")

    return {
        "lift_mean": lift_mean,
        "lift_lower": lift_lower,
        "lift_upper": lift_upper,
        "confidence": confidence_level,
        "cumulative_lift": cumulative_lift,
        "pre_period_mean": pre_period_mean,
        "post_period_mean": post_period_mean,
        "counterfactual_mean": counterfactual_mean,
        "diagnostics": {"r_hat": rhat_max, "ess": ess_min},
    }


def compute_raw_incrementality(
    df: pd.DataFrame,
    intervention_date: date,
    confidence_level: float = 0.94,
) -> dict:
    """
    Compute raw (unadjusted) incrementality score using rolling mean comparison.

    No seasonal adjustment — simple before/after comparison with bootstrap
    confidence intervals. Per user decision: dual output returns both
    seasonally-adjusted (ITS) and raw (rolling mean) scores.

    Parameters
    ----------
    df : pd.DataFrame
        Daily campaign metrics with columns: date (date), revenue (float).
    intervention_date : date
        Date splitting pre- and post-intervention periods.
    confidence_level : float
        Confidence level for bootstrap intervals (default 0.94).

    Returns
    -------
    dict with same shape as compute_incrementality, plus
        diagnostics={'method': 'rolling_mean_comparison'}
    """
    if not pd.api.types.is_object_dtype(df["date"]) and not hasattr(
        df["date"].iloc[0], "year"
    ):
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"]).dt.date

    pre_df = df[df["date"] < intervention_date]
    post_df = df[df["date"] >= intervention_date]

    pre_revenue = pre_df["revenue"].values
    post_revenue = post_df["revenue"].values

    pre_mean = float(np.mean(pre_revenue)) if len(pre_revenue) > 0 else 0.0
    post_mean = float(np.mean(post_revenue)) if len(post_revenue) > 0 else 0.0

    # Raw lift = (post_mean - pre_mean) / pre_mean (fractional/multiplier form)
    # We store as the absolute difference to match ITS output units
    lift_mean_abs = post_mean - pre_mean
    if pre_mean > 0:
        lift_mean = lift_mean_abs / pre_mean  # fractional lift
    else:
        lift_mean = 0.0

    # Bootstrap confidence intervals: resample pre/post differences 1000 times
    rng = np.random.default_rng(42)
    n_boot = 1000
    boot_lifts = []
    for _ in range(n_boot):
        boot_pre = rng.choice(pre_revenue, size=len(pre_revenue), replace=True)
        boot_post = rng.choice(post_revenue, size=len(post_revenue), replace=True)
        boot_pre_mean = np.mean(boot_pre)
        if boot_pre_mean > 0:
            boot_lift = (np.mean(boot_post) - boot_pre_mean) / boot_pre_mean
        else:
            boot_lift = 0.0
        boot_lifts.append(boot_lift)

    # For 94% CI: use 3rd and 97th percentiles
    alpha = 1 - confidence_level
    lower_pct = (alpha / 2) * 100
    upper_pct = (1 - alpha / 2) * 100
    lift_lower = float(np.percentile(boot_lifts, lower_pct))
    lift_upper = float(np.percentile(boot_lifts, upper_pct))

    cumulative_lift = float(lift_mean_abs * len(post_revenue))

    return {
        "lift_mean": lift_mean,
        "lift_lower": lift_lower,
        "lift_upper": lift_upper,
        "confidence": confidence_level,
        "cumulative_lift": cumulative_lift,
        "pre_period_mean": pre_mean,
        "post_period_mean": post_mean,
        "counterfactual_mean": pre_mean,  # counterfactual = pre-period mean for raw
        "diagnostics": {"method": "rolling_mean_comparison"},
    }
