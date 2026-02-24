# Phase 3: Statistical Engine - Research

**Researched:** 2026-02-24
**Domain:** Bayesian time-series inference, causal impact measurement, seasonality decomposition, Python statistical microservice
**Confidence:** MEDIUM-HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Incrementality Methodology
- Bayesian inference for measuring campaign-level lift — produces probability distributions with credible intervals
- Time-series counterfactual for baseline forecasting — predict what would have happened organically, incrementality = actual minus counterfactual
- Minimum data threshold required before scoring (e.g., 30 days), then use Bayesian hierarchical pooling — campaigns with sparse data borrow strength from similar campaigns in their cluster/channel
- Campaigns below the minimum threshold show "Insufficient data" rather than a noisy score
- Diminishing returns detection for saturation curves — model spend-to-outcome curve per campaign, output "this campaign is at X% of its saturation point"

#### Score Hierarchy & Rollups
- 4-level hierarchy: Campaign → Cluster (Platform × Funnel Stage) → Channel (Platform) → Overall
- Funnel stages are fixed taxonomy: Awareness, Consideration, Conversion — auto-assigned from campaign objective, users can reassign campaigns between stages but cannot create custom stages
- Spend-weighted average for rollups — higher-spend campaigns contribute proportionally more to cluster/channel scores
- Uncertainty propagation: cluster/channel confidence intervals widen to reflect low-confidence campaigns within them (honest representation)
- Also surface a confidence-weighted "best estimate" alongside the uncertainty-propagated score — marketers always get a directional signal, never a dead-end "insufficient data" wall

#### Seasonality & Event Calendar
- Pre-load ~10-12 major US/global retail events: BFCM, Christmas, New Year, Valentine's Day, Mother's Day, Father's Day, Prime Day, Back to School, Easter, Labor Day, Memorial Day sales
- User-editable calendar — users can add brand-specific events (flash sales, product launches, annual promotions) so the engine adjusts forecasts for known upcoming spikes
- Dual output: show both seasonally-adjusted and raw (unadjusted) incrementality scores — users can see both perspectives
- Seasonality adjusts the counterfactual baseline ("December sales would have been higher anyway due to Christmas")
- Anomalies (unexpected spikes/dips not tied to known events) are flagged for user review, not auto-dampened — user decides if it was a PR mention, viral post, or data error

#### Budget Change Detection
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | System builds baseline forecast model from historical data for each campaign | Prophet (Python) with campaign-level per-model fitting; stored as JSON in DB; improves with data via refit schedule |
| STAT-02 | System produces campaign-level incrementality scores that roll up to clusters, channels, and overall | CausalPy Interrupted Time Series + Bayesian hierarchical pooling via PyMC; spend-weighted rollup logic in TypeScript |
| STAT-03 | All predictions and scores include confidence intervals | Native to all Bayesian methods (credible intervals from posterior distributions); stored as lower/upper columns in schema |
| STAT-04 | System performs time-series pre/post analysis when budget changes are detected | CausalPy ITS; budget change detection via percentage-threshold rule over campaign_metrics; triggers reruns |
| STAT-05 | System supports geo-based testing with market-level control groups | Deferred to Phase 5 (MRKT-xx requirements). Phase 3 scope is single-market campaign-level scoring |
| STAT-06 | System models saturation curves to detect diminishing returns on spend | Hill function / LogisticSaturation from PyMC-Marketing; output "X% of saturation" per campaign |
| STAT-07 | Model accuracy improves as more data accumulates over time | Implemented via scheduled refitting (BullMQ weekly job) and Bayesian posterior update pattern |
| SEAS-01 | System includes pre-loaded retail event calendar (BFCM, Christmas, etc.) | Prophet holiday DataFrame with 10-12 US/global events; stored in DB as user-editable records |
| SEAS-02 | System detects anomalies and seasonal patterns from historical data | STL decomposition via statsmodels; residual outlier detection; anomaly records stored for user review |
</phase_requirements>

---

## Summary

The core challenge in Phase 3 is that the statistical work requires Python — the dominant Bayesian and time-series ecosystem has no meaningful JavaScript equivalent. The project is already Node.js/TypeScript, so Phase 3 must introduce a Python worker process that shares the existing BullMQ/Redis job queue. This is supported: BullMQ has an official Python package (`bullmq` on PyPI) that consumes from the same Redis queues as Node.js workers, though the Python port has feature gaps. A simpler and more reliable alternative is a lightweight FastAPI sidecar that Node.js calls via HTTP, keeping the Python surface area small and bounded.

The recommended Python stack is: **Prophet** (baseline forecasting + seasonality + holiday calendar), **CausalPy** (Interrupted Time Series for pre/post budget change analysis and counterfactual incrementality), **PyMC-Marketing** (saturation curves via Hill function / LogisticSaturation), and **statsmodels** (STL decomposition for anomaly detection). This stack is mature, actively maintained (all updated in 2024-2025), and directly targets the use cases in the requirements. The existing `campaign_metrics` schema already has `modeled_*` columns that Phase 3 populates — no structural schema changes are needed for the primary output, only new tables for scores, seasonal events, budget change records, and saturation estimates.

The TypeScript side handles: BullMQ job dispatch, budget change threshold detection (query-based, no Python needed), score hierarchy rollup computations, result persistence back to the DB, and all API endpoints that Phase 4 will consume. The Python side handles only the heavy statistical computation and returns structured JSON. This clean boundary keeps Python complexity isolated.

**Primary recommendation:** Introduce a `packages/analysis` Python package (FastAPI + Prophet + CausalPy + PyMC-Marketing + statsmodels), called by a new `packages/ingestion`-style TypeScript orchestrator that dispatches scoring jobs via BullMQ and writes results to the DB.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prophet (Python) | 1.1.x | Baseline forecasting, seasonality decomposition, holiday calendar | Industry standard for business time-series; handles retail seasonality and custom holidays natively; additive model with transparent components |
| CausalPy (Python) | 0.7.0 | Interrupted Time Series (ITS) for counterfactual baseline and budget change pre/post analysis | Directly implements the ITS + Bayesian posterior methodology chosen; actively maintained by PyMC Labs; latest release Jan 2025 |
| PyMC-Marketing (Python) | 0.18.x | Saturation curves (Hill/LogisticSaturation), adstock modeling, Bayesian MMM primitives | Industry-standard Bayesian marketing toolkit; saturation curve implementation is battle-tested; hierarchical model support built-in |
| statsmodels (Python) | 0.14.x | STL decomposition for seasonal component extraction and anomaly residual detection | Canonical Python implementation of Loess-based seasonal decomposition; well-maintained |
| FastAPI (Python) | 0.115.x | HTTP interface between TypeScript orchestrator and Python statistical engine | Low boilerplate, async, auto-generates OpenAPI schema for TypeScript client generation; industry standard for ML serving |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PyMC (Python) | 5.x | Underlying probabilistic programming for CausalPy/PyMC-Marketing | Pulled in as transitive dependency; direct use only if custom Bayesian model is needed beyond what CausalPy/PyMC-Marketing provide |
| ArviZ (Python) | 0.19.x | Posterior diagnostics and credible interval extraction | Used alongside PyMC/CausalPy to extract HDI (highest density intervals) for confidence interval storage |
| pandas (Python) | 2.x | DataFrame operations; required by Prophet and CausalPy | Transitive dependency; used directly to shape campaign_metrics data before model fitting |
| numpy (Python) | 1.26.x / 2.x | Numerical array operations | Transitive dependency across all Python libraries; use directly for Hill function percentage calculation |
| ruptures (Python) | 1.1.x | Change-point detection for budget shift identification | PELT algorithm for detecting structural breaks in spend time series; faster than statistical test approaches for this use case |
| uv (Python tooling) | latest | Python package manager and virtual environment | Replaces pip/venv; significantly faster installs; lockfile support for reproducibility |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CausalPy (ITS) | tfcausalimpact (TF Probability port of Google CausalImpact) | tfcausalimpact is less actively maintained; CausalPy integrates better with PyMC ecosystem already in use |
| FastAPI sidecar | BullMQ Python worker (direct queue consumer) | BullMQ Python port has acknowledged feature gaps vs Node.js version; FastAPI sidecar is simpler, testable in isolation, and language-agnostic |
| FastAPI sidecar | Python subprocess spawned from Node.js child_process | Subprocess approach is fragile for long-running models; FastAPI gives clean HTTP boundary, restartability, and health checks |
| Prophet | ARIMA (statsmodels) | ARIMA requires stationarity preprocessing, no native holiday support, harder to explain to non-statisticians; Prophet handles retail seasonality better out of the box |
| statsmodels STL | Prophet residual decomposition | Prophet's residuals can also detect anomalies, but STL is more interpretable and purpose-built for decomposition |

**Installation (Python):**
```bash
pip install prophet causalpy pymc-marketing statsmodels fastapi uvicorn ruptures pandas numpy arviz
# or with uv:
uv add prophet causalpy pymc-marketing statsmodels fastapi uvicorn ruptures pandas numpy arviz
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── db/                       # Existing — Drizzle schema, migrations
│   └── src/schema/
│       ├── metrics.ts        # Already has modeled_* columns (Phase 1)
│       ├── incrementality-scores.ts   # NEW: campaign/cluster/channel scores
│       ├── seasonal-events.ts         # NEW: pre-loaded + user calendar
│       ├── saturation-estimates.ts    # NEW: per-campaign saturation %
│       └── budget-changes.ts          # NEW: detected budget change records
├── ingestion/                # Existing — BullMQ workers, connectors
│   └── src/
│       ├── scheduler/        # Add: scoring job dispatch
│       └── scoring/          # NEW: TypeScript orchestration layer
│           ├── dispatch.ts   # Enqueue scoring jobs to BullMQ
│           ├── rollup.ts     # Spend-weighted score hierarchy rollup
│           └── persist.ts    # Write Python results back to DB
└── analysis/                 # NEW: Python statistical engine
    ├── pyproject.toml        # uv project config
    ├── main.py               # FastAPI app entrypoint
    ├── routers/
    │   ├── forecast.py       # POST /forecast — baseline + seasonality
    │   ├── incrementality.py # POST /incrementality — ITS counterfactual
    │   ├── saturation.py     # POST /saturation — Hill curve fitting
    │   └── anomalies.py      # POST /anomalies — STL residual detection
    ├── models/
    │   ├── baseline.py       # Prophet model wrapper
    │   ├── its.py            # CausalPy ITS wrapper
    │   ├── saturation.py     # PyMC-Marketing LogisticSaturation wrapper
    │   └── decompose.py      # statsmodels STL wrapper
    └── schemas/
        └── requests.py       # Pydantic input/output schemas
```

### Pattern 1: TypeScript Dispatch → Python Compute → TypeScript Persist

**What:** TypeScript BullMQ worker detects a scoring trigger (nightly after sync, or budget change detected), calls the FastAPI sidecar for computation, receives structured JSON, writes results to DB using Drizzle.

**When to use:** All statistical computation in Phase 3.

**Example (TypeScript dispatch side):**
```typescript
// packages/ingestion/src/scoring/dispatch.ts
import { Queue } from 'bullmq';

export async function enqueueScoringJob(tenantId: string, campaignId: string) {
  const queue = new Queue('scoring', { connection: redisConnection });
  await queue.add('score-campaign', { tenantId, campaignId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
}
```

**Example (Python FastAPI endpoint):**
```python
# packages/analysis/routers/incrementality.py
# Source: CausalPy ITS pattern from https://causalpy.readthedocs.io/en/latest/notebooks/its_lift_test.html
from fastapi import APIRouter
from causalpy import InferenceDataWrapper
import causalpy as cp
import pandas as pd

router = APIRouter()

@router.post("/incrementality")
async def compute_incrementality(request: IncrementalityRequest):
    df = pd.DataFrame(request.metrics)  # {date, spend, revenue, ...}
    model = cp.InterruptedTimeSeries(
        data=df[df['date'] < request.intervention_date],
        formula="revenue ~ 1 + t + C(month)",
        model=cp.pymc_models.LinearRegression(sample_kwargs={"draws": 1000})
    )
    # Predict counterfactual and compute lift
    post_df = df[df['date'] >= request.intervention_date]
    counterfactual = model.predict(post_df)
    lift_mean = (post_df['revenue'].values - counterfactual.mean(axis=0)).mean()
    lift_hdi = arviz.hdi(counterfactual, hdi_prob=0.94)
    return {
        "lift_mean": float(lift_mean),
        "lift_lower": float(lift_hdi[0]),
        "lift_upper": float(lift_hdi[1]),
        "confidence": 0.94,
    }
```

### Pattern 2: Spend-Weighted Score Rollup (TypeScript Only)

**What:** After Python computes campaign-level scores, TypeScript rolls them up to cluster/channel/overall using spend-weighted averaging with uncertainty propagation.

**When to use:** Score hierarchy construction after Python results are persisted.

```typescript
// packages/ingestion/src/scoring/rollup.ts
// Spend-weighted mean incrementality lift
function spendWeightedRollup(scores: CampaignScore[]): RollupScore {
  const totalSpend = scores.reduce((sum, s) => sum + s.spendUsd, 0);
  const weightedLift = scores.reduce(
    (sum, s) => sum + (s.liftMean * s.spendUsd) / totalSpend, 0
  );
  // Uncertainty propagation: variance-weighted combination
  const propagatedVariance = scores.reduce(
    (sum, s) => sum + Math.pow((s.liftUpper - s.liftLower) / 4, 2) * Math.pow(s.spendUsd / totalSpend, 2),
    0
  );
  const rollupHalfWidth = 2 * Math.sqrt(propagatedVariance); // ~95%
  return {
    liftMean: weightedLift,
    liftLower: weightedLift - rollupHalfWidth,
    liftUpper: weightedLift + rollupHalfWidth,
  };
}
```

### Pattern 3: Prophet Baseline with Holiday Calendar

**What:** Fit a Prophet model per campaign using pre/post data; inject retail event calendar as holidays. Returns trend + seasonality decomposition and forward forecast.

```python
# packages/analysis/models/baseline.py
# Source: https://facebook.github.io/prophet/docs/seasonality,_holiday_effects,_and_regressors.html
from prophet import Prophet
import pandas as pd

RETAIL_EVENTS = pd.DataFrame({
    'holiday': [
        'black_friday', 'cyber_monday', 'christmas', 'new_year',
        'valentines', 'mothers_day', 'fathers_day', 'prime_day',
        'back_to_school', 'easter', 'labor_day', 'memorial_day',
    ],
    'ds': [
        # Expanded with lower/upper_window for each event window
    ],
    'lower_window': [-3, 0, -7, -1, -1, -2, -2, 0, -7, -2, -1, -1],
    'upper_window': [1, 1, 1, 1, 0, 0, 0, 1, 7, 0, 0, 0],
})

def fit_baseline(df: pd.DataFrame, user_events: pd.DataFrame = None) -> dict:
    """
    df: columns [ds, y] where ds=date, y=revenue or conversions
    user_events: user-added brand events in same format as RETAIL_EVENTS
    """
    holidays = RETAIL_EVENTS
    if user_events is not None:
        holidays = pd.concat([holidays, user_events])

    m = Prophet(
        holidays=holidays,
        seasonality_mode='multiplicative',  # revenue grows with trend
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
    )
    m.fit(df)
    future = m.make_future_dataframe(periods=90)
    forecast = m.predict(future)

    return {
        "trend": forecast[['ds', 'trend']].to_dict('records'),
        "seasonal": forecast[['ds', 'yearly', 'weekly']].to_dict('records'),
        "forecast": forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].to_dict('records'),
        "components": forecast[['ds', 'trend', 'yearly', 'weekly', 'holidays']].to_dict('records'),
    }
```

### Pattern 4: Saturation Curve via Hill Function

**What:** Fit a Hill (logistic saturation) curve to spend vs. outcome data per campaign. Report current spend position as percentage of saturation.

```python
# packages/analysis/models/saturation.py
# Source: PyMC-Marketing LogisticSaturation pattern
import numpy as np

def hill_saturation_percent(spend_series: np.ndarray, revenue_series: np.ndarray) -> dict:
    """
    Returns saturation % for current average spend level.
    Hill function: f(x) = alpha * x^gamma / (mu^gamma + x^gamma)
    """
    from scipy.optimize import curve_fit

    def hill(x, alpha, mu, gamma):
        return alpha * (x ** gamma) / (mu ** gamma + x ** gamma)

    try:
        popt, pcov = curve_fit(
            hill, spend_series, revenue_series,
            p0=[max(revenue_series), np.median(spend_series), 1.0],
            bounds=([0, 0, 0.1], [np.inf, np.inf, 5.0]),
            maxfev=5000,
        )
        alpha, mu, gamma = popt
        current_spend = np.mean(spend_series[-30:])  # last 30 days avg
        current_output = hill(current_spend, alpha, mu, gamma)
        saturation_pct = current_output / alpha  # % of theoretical max
        return {"saturation_percent": float(saturation_pct), "alpha": float(alpha), "mu": float(mu), "gamma": float(gamma)}
    except RuntimeError:
        return {"saturation_percent": None, "error": "curve_fit_failed"}
```

### Pattern 5: Budget Change Detection (TypeScript, no Python)

**What:** Pure SQL/TypeScript — compare rolling spend averages to detect when spend changes by threshold%. Runs in BullMQ worker after nightly sync, before scoring jobs are dispatched.

```typescript
// packages/ingestion/src/scoring/budget-detection.ts
export async function detectBudgetChanges(
  db: DrizzleDB,
  tenantId: string,
  campaignId: string,
  thresholdPct = 0.25,
): Promise<BudgetChangeEvent | null> {
  // Compute 14-day rolling average pre vs post today's date
  const result = await db.execute(sql`
    WITH recent AS (
      SELECT date, spend_usd,
        AVG(spend_usd) OVER (ORDER BY date ROWS BETWEEN 27 PRECEDING AND 14 PRECEDING) AS avg_before,
        AVG(spend_usd) OVER (ORDER BY date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW) AS avg_after
      FROM campaign_metrics
      WHERE tenant_id = ${tenantId} AND campaign_id = ${campaignId}
      ORDER BY date DESC LIMIT 30
    )
    SELECT * FROM recent
    WHERE ABS(avg_after - avg_before) / NULLIF(avg_before, 0) > ${thresholdPct}
    ORDER BY date DESC LIMIT 1
  `);
  return result.rows[0] ?? null;
}
```

### Anti-Patterns to Avoid

- **Running Python models synchronously in HTTP request handlers:** Model fitting takes seconds to minutes; always run via BullMQ job, never inline in a Next.js API route.
- **Fitting one model for all campaigns:** Each campaign has its own spend-outcome relationship; models must be per-campaign. Share priors via hierarchical pooling, not shared model instances.
- **Storing raw posterior samples in the DB:** Store only summary statistics (mean, lower HDI, upper HDI, confidence). Raw samples are MB-scale per campaign.
- **Blocking Python on missing data:** Enforce the minimum data threshold check in TypeScript before dispatching to Python. Python should never receive fewer rows than the minimum window.
- **Re-fitting models on every API call:** Models are expensive. Fit on schedule (nightly + triggered by budget change), cache results in DB, serve from DB on demand.
- **Using BullMQ Python worker as primary integration point:** BullMQ Python port has acknowledged feature gaps. Use FastAPI HTTP sidecar for Python, keep BullMQ in TypeScript.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Baseline time-series forecasting | Custom AR/ARIMA model | Prophet | Holiday calendar integration, multiplicative seasonality, uncertainty intervals all built-in; hand-rolled ARIMA lacks holiday awareness |
| Counterfactual impact measurement | Custom pre/post regression | CausalPy ITS | Bayesian posterior propagation, proper uncertainty quantification; hand-rolled t-tests don't produce posterior distributions |
| Saturation curve estimation | Custom curve fitting from scratch | PyMC-Marketing LogisticSaturation or scipy curve_fit with Hill function | Prior selection for Bayesian version handles low-data campaigns; scipy curve_fit for deterministic fallback |
| Seasonal decomposition | Manual Fourier extraction | statsmodels STL (seasonal_decompose or STL class) | Robust to outliers, LOESS-based, handles irregular seasonality |
| Change-point detection | Rule-based spike detection | ruptures PELT algorithm (or simple rolling-average percentage check for Phase 3 budget detection) | Statistical grounding; PELT is O(n) and handles multiple change points |
| Credible interval computation | Manual quantile calculation | ArviZ hdi() | Handles multimodal distributions correctly; highest density interval is more appropriate than equal-tail for skewed posteriors |

**Key insight:** Statistical methods have decades of edge cases baked into standard libraries. The failure modes (non-convergence, numerical instability, degenerate priors) are not obvious until production. Use libraries that have already encountered and handled these cases.

---

## Common Pitfalls

### Pitfall 1: CausalPy Requires Sufficient Pre-Period Data

**What goes wrong:** CausalPy ITS model fails to converge or produces degenerate posteriors when the pre-intervention period is too short (< 30-60 data points).
**Why it happens:** The model needs enough pre-period observations to establish a stable baseline trend and seasonal pattern.
**How to avoid:** Enforce minimum 30-day pre-period check in TypeScript dispatch layer before sending to Python. For campaigns with less pre-period data, fall back to simple mean comparison rather than ITS.
**Warning signs:** ArviZ R-hat values > 1.1 in the returned diagnostics; ESS (effective sample size) < 100.

### Pitfall 2: Prophet's Weekly Seasonality Breaks with Irregular Data

**What goes wrong:** Prophet produces nonsensical weekly seasonal patterns when campaign data has many zero-spend days (paused campaigns).
**Why it happens:** Prophet assumes regular observations; gaps are fine but many contiguous zeros create artificial patterns.
**How to avoid:** Filter out zero-spend days before fitting baseline model, or use `weekly_seasonality=False` for campaigns with highly irregular spend patterns. Detect zero-spend runs in TypeScript before dispatch.

### Pitfall 3: Hierarchical Pooling Across Non-Comparable Campaigns

**What goes wrong:** Pooling Awareness campaigns with Conversion campaigns produces nonsensical priors.
**Why it happens:** Conversion campaigns have fundamentally different spend-outcome relationships than brand awareness campaigns.
**How to avoid:** Hierarchical pooling must be within cluster (Platform × Funnel Stage), not across clusters. Separate PyMC hierarchical models per cluster, not one global model.

### Pitfall 4: Saturation Curve Fitting Fails for New Campaigns

**What goes wrong:** `scipy.optimize.curve_fit` raises RuntimeError when a campaign has little spend variation (e.g., flat budget for 30 days), making saturation estimation impossible.
**Why it happens:** Curve fitting requires spend range variation to distinguish the shape of the Hill curve.
**How to avoid:** Require a minimum coefficient of variation (CV) in spend before attempting saturation modeling. Return `saturation_percent: null` with reason string when insufficient variation exists, which TypeScript surfaces as "Saturation data insufficient."

### Pitfall 5: Budget Change Detection False Positives from Platform Billing Cycles

**What goes wrong:** Ad platform billing cycles (monthly resets, mid-month adjustments) trigger false budget change alerts.
**Why it happens:** Spend dips at billing boundaries mimic genuine budget cuts.
**How to avoid:** Apply a 3-day smoothing window to spend data before threshold comparison. Let users dismiss alerts (write `dismissed_at` to budget_changes table). Pre-load known billing cycle dates as a filter if detectable.

### Pitfall 6: Python Package Environment Conflicts

**What goes wrong:** PyMC and Prophet have conflicting NumPy/TensorFlow dependency requirements that cause import errors at runtime.
**Why it happens:** Prophet uses pystan, PyMC uses JAX/aesara; they can conflict depending on versions.
**How to avoid:** Use `uv` with a locked `uv.lock` file. Test the environment on a fresh system before deploying. If conflicts persist, run Prophet in a separate virtual environment from PyMC and route via separate FastAPI app instances (unlikely to be needed but plan for it).

### Pitfall 7: campaign_metrics modeled_* Columns are the Wrong Storage Layer for Scores

**What goes wrong:** Storing all incrementality scores in the existing `campaign_metrics` hypertable means a full table scan is required to find the latest score for a campaign.
**Why it happens:** `campaign_metrics` is designed as a per-day fact table, not a per-campaign summary table.
**How to avoid:** Create a separate `incrementality_scores` table for current/latest scores, and a `score_history` table or TimescaleDB hypertable for historical model runs. Update `modeled_*` columns in `campaign_metrics` only for per-day revenue attribution (ARCH-02 requirement), not for the scored lift summary.

---

## Code Examples

### Anomaly Detection via STL Residuals

```python
# packages/analysis/models/decompose.py
# Source: statsmodels STL — https://www.statsmodels.org/dev/examples/notebooks/generated/stl_decomposition.html
from statsmodels.tsa.seasonal import STL
import pandas as pd
import numpy as np

def detect_anomalies(df: pd.DataFrame, threshold_sigma: float = 2.5) -> list[dict]:
    """
    df: columns [date, revenue], date as datetime index
    Returns list of anomaly records with date, actual, expected, deviation_sigma
    """
    series = df.set_index('date')['revenue']
    stl = STL(series, period=7, seasonal=13)  # weekly period, robust seasonal window
    result = stl.fit(robust=True)

    residuals = result.resid
    sigma = residuals.std()
    anomalies = residuals[abs(residuals) > threshold_sigma * sigma]

    return [
        {
            "date": str(date),
            "actual": float(series[date]),
            "expected": float(series[date] - residuals[date]),
            "deviation_sigma": float(residuals[date] / sigma),
            "direction": "spike" if residuals[date] > 0 else "dip",
        }
        for date in anomalies.index
    ]
```

### FastAPI Health Check and Routing

```python
# packages/analysis/main.py
from fastapi import FastAPI
from routers import forecast, incrementality, saturation, anomalies

app = FastAPI(title="Incremental IQ Analysis Engine", version="1.0.0")

app.include_router(forecast.router, prefix="/forecast")
app.include_router(incrementality.router, prefix="/incrementality")
app.include_router(saturation.router, prefix="/saturation")
app.include_router(anomalies.router, prefix="/anomalies")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

### TypeScript BullMQ Scoring Worker

```typescript
// packages/ingestion/src/scoring/worker.ts
import { Worker } from 'bullmq';

const scoringWorker = new Worker(
  'scoring',
  async (job) => {
    const { tenantId, campaignId, triggerType } = job.data;

    // 1. Fetch campaign_metrics from DB
    const metrics = await fetchCampaignMetrics(db, tenantId, campaignId);

    // 2. Check minimum data threshold
    if (metrics.length < 30) {
      await markInsufficientData(db, tenantId, campaignId);
      return;
    }

    // 3. Call Python FastAPI sidecar
    const baselineResult = await fetch(`${ANALYSIS_SERVICE_URL}/forecast`, {
      method: 'POST',
      body: JSON.stringify({ tenantId, campaignId, metrics }),
    }).then(r => r.json());

    const incrementalityResult = await fetch(`${ANALYSIS_SERVICE_URL}/incrementality`, {
      method: 'POST',
      body: JSON.stringify({ tenantId, campaignId, metrics }),
    }).then(r => r.json());

    // 4. Persist results
    await persistScores(db, tenantId, campaignId, { baselineResult, incrementalityResult });

    // 5. Recompute hierarchy rollups
    await recomputeRollups(db, tenantId);
  },
  { connection: redisConnection, concurrency: 2 },  // lower concurrency — Python is CPU-heavy
);
```

---

## Schema Additions Required

Phase 3 requires new DB tables in addition to populating existing `modeled_*` columns:

```typescript
// packages/db/src/schema/incrementality-scores.ts (NEW)
// One row per campaign per model run — latest run = current score
export const incrementalityScores = pgTable('incrementality_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull(),
  liftMean: numeric('lift_mean', { precision: 8, scale: 6 }),
  liftLower: numeric('lift_lower', { precision: 8, scale: 6 }),
  liftUpper: numeric('lift_upper', { precision: 8, scale: 6 }),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  dataPoints: numeric('data_points', { precision: 8, scale: 0 }),
  status: text('status').notNull(), // 'scored' | 'insufficient_data' | 'error'
  rawModelOutput: jsonb('raw_model_output'), // full Python response for debugging
});

// packages/db/src/schema/seasonal-events.ts (NEW)
// Pre-loaded retail events + user-added brand events
export const seasonalEvents = pgTable('seasonal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'), // NULL = system event (pre-loaded)
  name: text('name').notNull(),
  eventDate: date('event_date').notNull(),
  windowBefore: numeric('window_before', { precision: 4, scale: 0 }).default('0'),
  windowAfter: numeric('window_after', { precision: 4, scale: 0 }).default('0'),
  isUserDefined: boolean('is_user_defined').notNull().default(false),
});

// packages/db/src/schema/budget-changes.ts (NEW)
export const budgetChanges = pgTable('budget_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  changeDate: date('change_date').notNull(),
  spendBefore: numeric('spend_before_avg', { precision: 12, scale: 4 }),
  spendAfter: numeric('spend_after_avg', { precision: 12, scale: 4 }),
  changePct: numeric('change_pct', { precision: 8, scale: 4 }),
  liftImpact: numeric('lift_impact', { precision: 8, scale: 6 }),
  liftImpactLower: numeric('lift_impact_lower', { precision: 8, scale: 6 }),
  liftImpactUpper: numeric('lift_impact_upper', { precision: 8, scale: 6 }),
  source: text('source').notNull(), // 'auto_detected' | 'user_flagged'
  status: text('status').notNull(), // 'pending_analysis' | 'analyzed' | 'dismissed'
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
});

// packages/db/src/schema/saturation-estimates.ts (NEW)
export const saturationEstimates = pgTable('saturation_estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  estimatedAt: timestamp('estimated_at', { withTimezone: true }).notNull(),
  saturationPct: numeric('saturation_pct', { precision: 5, scale: 4 }), // 0.0-1.0
  hillAlpha: numeric('hill_alpha', { precision: 14, scale: 6 }),
  hillMu: numeric('hill_mu', { precision: 14, scale: 6 }),
  hillGamma: numeric('hill_gamma', { precision: 8, scale: 4 }),
  status: text('status').notNull(), // 'estimated' | 'insufficient_variation' | 'error'
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Holdout testing as primary measurement | Statistical modeling (ITS/Bayesian) as primary | 2020-2023 (cookie deprecation era) | Enables measurement without control groups |
| Google's CausalImpact (R package) | CausalPy / PyMC-based ITS | 2022-2024 | Better Python integration, more extensible priors |
| Separate seasonality preprocessing | Prophet handles seasonality as part of model | 2017+ (Prophet release) | Unified model reduces preprocessing errors |
| Point estimates for lift | Posterior distributions / credible intervals | Bayesian adoption 2020+ | Honest uncertainty communication to users |
| Global model per account | Per-campaign models with hierarchical priors | Current best practice | Campaigns are too heterogeneous for pooled model |

**Deprecated/outdated:**
- `fbprophet` (PyPI name): Replaced by `prophet` as of v1.0. Do not use `fbprophet`.
- PyMC3: Replaced by PyMC (v4+). CausalPy and PyMC-Marketing target PyMC (v4/v5).
- CausalPy < 0.7: BSTS support marked experimental; use ITS models which are stable.

---

## Open Questions

1. **Python environment packaging for deployment**
   - What we know: The project deploys to Railway (noted in STATE.md). Railway supports custom Docker images.
   - What's unclear: Whether Railway's standard Python buildpack handles PyMC's C-extension dependencies (JAX, pytensor) without a custom Dockerfile.
   - Recommendation: Plan for a custom Docker image for the analysis service from the start. Do not assume pip install works without system dependencies (gcc, libffi, etc.).

2. **Model fitting time vs. nightly sync window**
   - What we know: BullMQ nightly sync runs at 2am UTC. Model fitting for all campaigns for a tenant could take minutes if there are many campaigns.
   - What's unclear: At what campaign count does fitting time exceed the sync-to-analysis window?
   - Recommendation: Run scoring as a separate BullMQ queue (not blocking ingestion), with concurrency 2. Add job timeout of 10 minutes per campaign. Profile fitting time on real data in early plans.

3. **Score freshness when campaigns have no recent data**
   - What we know: Campaigns can be paused; no new spend data means no new model input.
   - What's unclear: Should scores expire (show as stale) if no new data in N days?
   - Recommendation: Add `scored_at` timestamp to `incrementality_scores`. Phase 4 UI can show "Score based on data through [date]" for stale campaigns.

4. **STAT-05 (geo-based testing) scope in this phase**
   - What we know: STAT-05 is in the Phase 3 requirements list but geo/market support is Phase 5's domain (MRKT-xx requirements).
   - What's unclear: STAT-05 says "market-level control groups" — is this foundational infrastructure needed now?
   - Recommendation: Implement the schema scaffolding for market segmentation (nullable market_id on scores) but defer actual geo-control-group computation to Phase 5. Mark STAT-05 as "scaffolded, not implemented" in this phase.

---

## Sources

### Primary (HIGH confidence)
- [CausalPy 0.7.0 release notes](https://github.com/pymc-labs/CausalPy/releases) — latest release Jan 12 2025, active maintenance confirmed
- [CausalPy ITS Lift Test documentation](https://causalpy.readthedocs.io/en/latest/notebooks/its_lift_test.html) — ITS methodology, inputs/outputs verified
- [Prophet Holiday Effects documentation](https://facebook.github.io/prophet/docs/seasonality,_holiday_effects,_and_regressors.html) — custom holiday DataFrame format, add_country_holidays, user-defined events confirmed
- [PyMC-Marketing 0.18.x](https://www.pymc-marketing.io/en/latest/) — saturation effects, lift test calibration, hierarchical models verified
- [statsmodels STL documentation](https://www.statsmodels.org/dev/examples/notebooks/generated/stl_decomposition.html) — STL decomposition API confirmed
- [BullMQ Python interoperability](https://bullmq.io/) — same Redis queue consumption confirmed; feature gaps acknowledged

### Secondary (MEDIUM confidence)
- FastAPI + Next.js monorepo integration pattern ([vintasoftware blog](https://www.vintasoftware.com/blog/nextjs-fastapi-monorepo)) — OpenAPI-based TypeScript client generation pattern
- Hill function for spend saturation ([PyMC-Marketing MMM docs](https://juanitorduz.github.io/pymc_mmm/), [Medium 2025](https://medium.com/@amitavamanna/return-on-marketing-investments-using-bayesian-regressadstock-and-hill-function-66ffa3ce1fd1)) — Hill function + LogisticSaturation confirmed as PyMC-Marketing primitives
- ruptures PELT algorithm ([GitHub](https://github.com/deepcharles/ruptures)) — change-point detection Python library, actively maintained

### Tertiary (LOW confidence)
- Railway Docker support for PyMC — assumed based on Railway's general custom image support; needs verification against Railway's current Python runtime options
- BullMQ Python worker feature parity — "feature gaps" stated in BullMQ docs without enumeration; exact missing features unknown

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against official docs and recent releases (Jan-Oct 2025)
- Architecture: MEDIUM — FastAPI sidecar pattern is well-established but project-specific integration details need validation during implementation
- Pitfalls: MEDIUM — most derived from official docs and known library limitations; Railway-specific deployment pitfalls are LOW

**Research date:** 2026-02-24
**Valid until:** 2026-03-26 (30 days — stable libraries, but PyMC ecosystem moves quickly)
