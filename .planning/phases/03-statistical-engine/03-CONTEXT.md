# Phase 3: Statistical Engine - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The system produces campaign-level incrementality scores with confidence intervals, backed by a baseline forecast, seasonality decomposition, and saturation curve modeling. This phase builds the analytical engine — all computational models and scoring logic. The dashboard/UI that surfaces these outputs is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Incrementality Methodology
- Bayesian inference for measuring campaign-level lift — produces probability distributions with credible intervals
- Time-series counterfactual for baseline forecasting — predict what would have happened organically, incrementality = actual minus counterfactual
- Minimum data threshold required before scoring (e.g., 30 days), then use Bayesian hierarchical pooling — campaigns with sparse data borrow strength from similar campaigns in their cluster/channel
- Campaigns below the minimum threshold show "Insufficient data" rather than a noisy score
- Diminishing returns detection for saturation curves — model spend-to-outcome curve per campaign, output "this campaign is at X% of its saturation point"

### Score Hierarchy & Rollups
- 4-level hierarchy: Campaign → Cluster (Platform × Funnel Stage) → Channel (Platform) → Overall
- Funnel stages are fixed taxonomy: Awareness, Consideration, Conversion — auto-assigned from campaign objective, users can reassign campaigns between stages but cannot create custom stages
- Spend-weighted average for rollups — higher-spend campaigns contribute proportionally more to cluster/channel scores
- Uncertainty propagation: cluster/channel confidence intervals widen to reflect low-confidence campaigns within them (honest representation)
- Also surface a confidence-weighted "best estimate" alongside the uncertainty-propagated score — marketers always get a directional signal, never a dead-end "insufficient data" wall

### Seasonality & Event Calendar
- Pre-load ~10-12 major US/global retail events: BFCM, Christmas, New Year, Valentine's Day, Mother's Day, Father's Day, Prime Day, Back to School, Easter, Labor Day, Memorial Day sales
- User-editable calendar — users can add brand-specific events (flash sales, product launches, annual promotions) so the engine adjusts forecasts for known upcoming spikes
- Dual output: show both seasonally-adjusted and raw (unadjusted) incrementality scores — users can see both perspectives
- Seasonality adjusts the counterfactual baseline ("December sales would have been higher anyway due to Christmas")
- Anomalies (unexpected spikes/dips not tied to known events) are flagged for user review, not auto-dampened — user decides if it was a PR mention, viral post, or data error

### Budget Change Detection
- Percentage threshold detection — flag when spend changes by more than a threshold (e.g., 20-30%) compared to prior period
- Default to adaptive time windows (sized based on campaign spend level and data density) with an option for users to switch to symmetric fixed windows (e.g., 14 days pre vs 14 days post) for manual control
- Users can manually flag budget changes the engine missed AND dismiss auto-detected false positives (e.g., platform billing glitches)
- Output as both: a self-contained impact summary card (change date, magnitude, pre/post comparison, estimated incremental impact, confidence) AND timeline annotation on the campaign's performance timeline

### Claude's Discretion
- Exact Bayesian model specification and prior selection
- Change-point percentage threshold tuning (20% vs 25% vs 30%)
- Minimum data window exact duration (30 days is a guideline, not hard requirement)
- Hierarchical pooling implementation details
- Saturation curve functional form
- Anomaly detection algorithm choice
- Seasonal decomposition method

</decisions>

<specifics>
## Specific Ideas

- Marketers should never stare at "not enough data" with no guidance — always provide a directional signal even when confidence is low
- Funnel stages (Awareness/Consideration/Conversion) map to how media buyers actually think about campaign structure
- Budget change analysis should feel like a self-contained story: "what happened when we changed the budget"
- Dual seasonality output lets analysts make their own call while giving business owners a clean adjusted number

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-statistical-engine*
*Context gathered: 2026-02-24*
