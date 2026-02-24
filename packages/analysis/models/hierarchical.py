"""
Bayesian hierarchical pooling for sparse campaigns within a cluster.

When a campaign has fewer than MIN_PRE_PERIOD_DAYS data points, it cannot be
scored via CausalPy ITS alone. This module fits a PyMC hierarchical model
that pools information across campaigns in the same cluster, allowing sparse
campaigns to borrow strength from well-estimated peers.

Per product decision: "marketers always get a directional signal, never a
dead-end 'insufficient data' wall" (RESEARCH.md Pitfall 3).

Cluster boundary: Pooling is within (Platform x Funnel Stage) cluster only.
Pooling across non-comparable clusters produces nonsensical priors (Pitfall 3).
"""

from datetime import date
from typing import Optional

import numpy as np
import pymc as pm
import arviz as az

from models.its import compute_incrementality, compute_raw_incrementality, MIN_PRE_PERIOD_DAYS


def hierarchical_pooled_estimate(
    campaigns: list[dict],
    cluster_key: str,
) -> list[dict]:
    """
    Fit a Bayesian hierarchical model to produce pooled lift estimates for
    all campaigns in a cluster. Sparse campaigns borrow strength from
    well-estimated peers.

    Parameters
    ----------
    campaigns : list[dict]
        Each dict contains:
          - campaign_id (str)
          - metrics (list[dict]): daily metrics with date, spend_usd, revenue
          - intervention_date (str): ISO format date string
          - data_points_count (int): total data points available

    cluster_key : str
        Identifier for the cluster (e.g., "meta-conversion"). Used for
        logging and ensuring pooling only within comparable campaigns.

    Returns
    -------
    list[dict]
        One result per campaign with:
          - campaign_id
          - lift_mean, lift_lower, lift_upper
          - confidence
          - cumulative_lift, pre_period_mean, post_period_mean, counterfactual_mean
          - status: 'scored' (individually estimated) or 'pooled_estimate' (sparse)
          - diagnostics
    """
    import pandas as pd

    if not campaigns:
        return []

    # If only one campaign, fall back to individual estimation (no pooling possible)
    if len(campaigns) == 1:
        return _estimate_individually(campaigns)

    # Step 1: Get individual ITS estimates for data-rich campaigns
    individual_estimates = {}
    sparse_campaign_ids = set()

    for camp in campaigns:
        campaign_id = camp["campaign_id"]
        n_points = camp.get("data_points_count", len(camp.get("metrics", [])))
        metrics = camp["metrics"]
        intervention_date_str = camp["intervention_date"]
        intervention_date = date.fromisoformat(intervention_date_str)

        df = pd.DataFrame(metrics)
        df["date"] = pd.to_datetime(df["date"]).dt.date

        pre_count = len(df[df["date"] < intervention_date])

        if pre_count >= MIN_PRE_PERIOD_DAYS:
            try:
                est = compute_incrementality(df, intervention_date)
                individual_estimates[campaign_id] = est
            except Exception:
                # If ITS fails despite enough data, treat as sparse
                sparse_campaign_ids.add(campaign_id)
        else:
            sparse_campaign_ids.add(campaign_id)

    # Step 2: If no individually-estimated campaigns, fall back to raw for all
    if not individual_estimates:
        return _estimate_individually(campaigns, force_raw=True)

    # Step 3: Compute cluster hyperparameters from individual estimates
    ind_lift_means = np.array(
        [individual_estimates[cid]["lift_mean"] for cid in individual_estimates]
    )
    cluster_mean = float(np.mean(ind_lift_means))
    cluster_std = float(np.std(ind_lift_means)) if len(ind_lift_means) > 1 else 0.2

    # Protect against zero std (identical estimates)
    if cluster_std < 0.01:
        cluster_std = 0.2

    # Step 4: Build PyMC hierarchical model
    # We use a simple Normal hierarchical model with observed data from
    # individual estimates and latent variables for sparse campaigns.
    n_campaigns = len(campaigns)
    camp_ids = [c["campaign_id"] for c in campaigns]
    camp_idx = {cid: i for i, cid in enumerate(camp_ids)}

    # Observed: individual lift estimates for data-rich campaigns
    observed_cids = list(individual_estimates.keys())
    observed_values = np.array([individual_estimates[cid]["lift_mean"] for cid in observed_cids])
    # Observation uncertainty: approximate as (upper - lower) / 2
    observed_sigmas = np.array([
        max(0.01, (individual_estimates[cid]["lift_upper"] - individual_estimates[cid]["lift_lower"]) / 2)
        for cid in observed_cids
    ])

    with pm.Model():
        # Cluster-level hyperpriors
        mu_cluster = pm.Normal("mu_cluster", mu=cluster_mean, sigma=max(cluster_std, 0.1))
        sigma_cluster = pm.HalfNormal("sigma_cluster", sigma=max(cluster_std, 0.1))

        # Per-campaign lift parameters (all campaigns, rich and sparse)
        lift_vars = []
        for cid in camp_ids:
            if cid in individual_estimates:
                # Data-rich: observed lift constrains the posterior
                sigma_obs = observed_sigmas[observed_cids.index(cid)]
                lift_i = pm.Normal(
                    f"lift_{cid}",
                    mu=mu_cluster,
                    sigma=sigma_cluster,
                    observed=individual_estimates[cid]["lift_mean"],
                )
                lift_vars.append(lift_i)
            else:
                # Sparse: unobserved — posterior pulled toward cluster mean
                lift_i = pm.Normal(
                    f"lift_{cid}",
                    mu=mu_cluster,
                    sigma=sigma_cluster * 2,  # wider prior for sparse campaigns
                )
                lift_vars.append(lift_i)

        # Sample with single chain to avoid Windows multiprocessing issues
        idata = pm.sample(
            draws=500,
            tune=200,
            chains=1,
            cores=1,
            target_accept=0.90,
            progressbar=False,
        )

    # Step 5: Extract results for all campaigns
    results = []
    for camp in campaigns:
        cid = camp["campaign_id"]
        metrics = camp["metrics"]
        intervention_date_str = camp["intervention_date"]
        intervention_date = date.fromisoformat(intervention_date_str)

        df = pd.DataFrame(metrics)
        df["date"] = pd.to_datetime(df["date"]).dt.date

        pre_df = df[df["date"] < intervention_date]
        post_df = df[df["date"] >= intervention_date]

        pre_mean = float(pre_df["revenue"].mean()) if not pre_df.empty else 0.0
        post_mean = float(post_df["revenue"].mean()) if not post_df.empty else 0.0

        if cid in individual_estimates:
            # Use individual estimate — slightly shrunk toward cluster by hierarchical model
            ind_est = individual_estimates[cid]

            # Posterior for this campaign's lift
            var_name = f"lift_{cid}"
            if var_name in idata.posterior:
                posterior_samples = idata.posterior[var_name].values.flatten()
                lift_mean = float(np.mean(posterior_samples))
                hdi = az.hdi(posterior_samples, hdi_prob=0.94)
                lift_lower = float(hdi[0])
                lift_upper = float(hdi[1])
            else:
                # Fall back to individual estimate
                lift_mean = ind_est["lift_mean"]
                lift_lower = ind_est["lift_lower"]
                lift_upper = ind_est["lift_upper"]

            cumulative_lift = lift_mean * len(post_df)
            counterfactual_mean = pre_mean  # approximate

            results.append({
                "campaign_id": cid,
                "lift_mean": lift_mean,
                "lift_lower": lift_lower,
                "lift_upper": lift_upper,
                "confidence": 0.94,
                "cumulative_lift": cumulative_lift,
                "pre_period_mean": pre_mean,
                "post_period_mean": post_mean,
                "counterfactual_mean": counterfactual_mean,
                "status": "scored",
                "diagnostics": ind_est.get("diagnostics", {}),
            })

        else:
            # Sparse campaign: use hierarchical posterior
            var_name = f"lift_{cid}"
            if var_name in idata.posterior:
                posterior_samples = idata.posterior[var_name].values.flatten()
                lift_mean = float(np.mean(posterior_samples))
                hdi = az.hdi(posterior_samples, hdi_prob=0.94)
                lift_lower = float(hdi[0])
                lift_upper = float(hdi[1])
            else:
                # Fallback to cluster mean if sampling failed
                lift_mean = cluster_mean
                lift_lower = cluster_mean - cluster_std
                lift_upper = cluster_mean + cluster_std

            # Confidence derived from posterior width: narrower = more confident
            # Sparse campaigns get lower confidence than data-rich campaigns
            posterior_width = lift_upper - lift_lower
            # Map posterior width to confidence: wide interval = lower confidence
            # Use a simple heuristic: confidence = max(0.5, 0.94 - width * 0.1)
            confidence = max(0.50, min(0.90, 0.94 - posterior_width * 0.05))

            cumulative_lift = lift_mean * max(1, len(post_df))
            counterfactual_mean = pre_mean  # approximate

            results.append({
                "campaign_id": cid,
                "lift_mean": lift_mean,
                "lift_lower": lift_lower,
                "lift_upper": lift_upper,
                "confidence": confidence,
                "cumulative_lift": cumulative_lift,
                "pre_period_mean": pre_mean,
                "post_period_mean": post_mean,
                "counterfactual_mean": counterfactual_mean,
                "status": "pooled_estimate",
                "diagnostics": {"method": "bayesian_hierarchical_pooling", "cluster_key": cluster_key},
            })

    return results


def _estimate_individually(
    campaigns: list[dict],
    force_raw: bool = False,
) -> list[dict]:
    """
    Estimate each campaign individually without hierarchical pooling.
    Used when the cluster has only one campaign or no data-rich campaigns.
    """
    import pandas as pd

    results = []
    for camp in campaigns:
        cid = camp["campaign_id"]
        metrics = camp["metrics"]
        intervention_date_str = camp["intervention_date"]
        intervention_date = date.fromisoformat(intervention_date_str)

        df = pd.DataFrame(metrics)
        df["date"] = pd.to_datetime(df["date"]).dt.date

        pre_df = df[df["date"] < intervention_date]
        post_df = df[df["date"] >= intervention_date]
        pre_mean = float(pre_df["revenue"].mean()) if not pre_df.empty else 0.0
        post_mean = float(post_df["revenue"].mean()) if not post_df.empty else 0.0

        pre_count = len(pre_df)

        if not force_raw and pre_count >= MIN_PRE_PERIOD_DAYS:
            try:
                est = compute_incrementality(df, intervention_date)
                results.append({
                    "campaign_id": cid,
                    "status": "scored",
                    **est,
                })
                continue
            except Exception:
                pass  # fall through to raw

        # Sparse or fallback: use raw estimation
        try:
            est = compute_raw_incrementality(df, intervention_date)
        except Exception:
            est = {
                "lift_mean": 0.0,
                "lift_lower": -0.5,
                "lift_upper": 0.5,
                "confidence": 0.50,
                "cumulative_lift": 0.0,
                "pre_period_mean": pre_mean,
                "post_period_mean": post_mean,
                "counterfactual_mean": pre_mean,
                "diagnostics": {"method": "fallback"},
            }

        results.append({
            "campaign_id": cid,
            "status": "pooled_estimate",
            **est,
        })

    return results
