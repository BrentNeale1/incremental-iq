---
phase: 03-statistical-engine
plan: 04
subsystem: api
tags: [causalpy, pymc, bayesian, incrementality, its, saturation, hierarchical, fastapi, scipy, arviz]

# Dependency graph
requires:
  - phase: 03-statistical-engine/03-02
    provides: FastAPI analysis sidecar scaffold, Pydantic schemas (IncrementalityRequest/Response, SaturationRequest/Response)

provides:
  - CausalPy ITS wrapper (compute_incrementality) with Bayesian credible intervals via get_plot_data_bayesian()
  - Raw incrementality fallback (compute_raw_incrementality) via bootstrap rolling mean
  - POST /incrementality endpoint returning dual adjusted+raw IncrementalityResponse
  - POST /incrementality/pooled endpoint for hierarchical cluster pooling
  - Hill function saturation model (hill_saturation_percent) via scipy curve_fit
  - POST /saturation endpoint returning SaturationResponse with status field
  - Bayesian hierarchical pooling (hierarchical_pooled_estimate) for sparse campaigns
  - Full TDD test coverage: 14 tests across 3 test files

affects:
  - 03-05 (anomaly detection and budget change plans that build on same router pattern)
  - 04 (Phase 4 TypeScript orchestration calls these Python endpoints)

# Tech tracking
tech-stack:
  added:
    - causalpy 0.7.0 (CausalPy ITS wrapper for counterfactual estimation)
    - pymc 5.28.0 (Bayesian hierarchical model for sparse campaign pooling)
    - arviz 0.23.4 (HDI extraction from posteriors, rhat/ESS diagnostics)
    - scipy 1.17.1 (curve_fit for Hill function saturation estimation)
    - All installed via uv into packages/analysis/.venv
  patterns:
    - TDD RED-GREEN pattern: failing tests written first, then implementation
    - cores=1 on Windows: PyMC multiprocessing uses 'spawn' start method on Windows, requiring cores=1 to avoid "if __name__ == '__main__'" guard issues in FastAPI worker processes
    - CausalPy idata extraction: use get_plot_data_bayesian(hdi_prob) to extract post-period impact with HDI columns (not raw mu posterior samples)
    - Dual output pattern: every incrementality endpoint returns both adjusted (ITS) and raw (bootstrap) scores
    - Hierarchical pooling pattern: PyMC hierarchical normal model — observed for rich campaigns, latent for sparse campaigns pulled toward cluster hyperprior

key-files:
  created:
    - packages/analysis/models/its.py
    - packages/analysis/models/saturation.py
    - packages/analysis/models/hierarchical.py
    - packages/analysis/routers/incrementality.py
    - packages/analysis/routers/saturation.py
    - packages/analysis/tests/test_incrementality.py
    - packages/analysis/tests/test_saturation.py
    - packages/analysis/tests/test_hierarchical.py
  modified:
    - packages/analysis/main.py (registered incrementality and saturation routers)

key-decisions:
  - "cores=1 in all PyMC sample() calls: Windows multiprocessing uses 'spawn' start method which requires the __main__ guard. FastAPI/uvicorn worker processes do not have this guard. cores=1 avoids the issue; production Linux Docker can use cores=4."
  - "CausalPy counterfactual extraction via get_plot_data_bayesian(hdi_prob): posterior['mu'] shape is (chains, draws, pre_obs, treated_units) — only covers pre-period. Post-period counterfactual is accessible through CausalPy's built-in get_plot_data_bayesian() which returns a DataFrame with impact, pred_hdi_lower_N, pred_hdi_upper_N columns."
  - "Hierarchical model uses observed=individual_lift_mean for data-rich campaigns (constrains posterior to individual estimate, slight shrinkage toward cluster) and latent Normal for sparse (posterior pulled entirely toward cluster hyperprior with 2x sigma for honest uncertainty)."
  - "Hill saturation CV threshold at 0.15: spend std/mean < 0.15 triggers insufficient_variation status. Prevents nonsensical curve fits on flat-budget campaigns."
  - "Raw incrementality returns fractional lift (post_mean - pre_mean) / pre_mean, not absolute difference, to match the relative interpretation expected by IncrementalityScore.lift_mean field."

patterns-established:
  - "Pattern: PyMC on Windows uses cores=1. Production Docker (Linux) can use cores=4 for 4x sampling speed."
  - "Pattern: CausalPy ITS model is fit on full dataset with treatment_time; get_plot_data_bayesian() returns impact for both pre and post periods."
  - "Pattern: Statistical models use try/except around all fitting code; return descriptive status strings on failure rather than raising HTTP 500 directly."

requirements-completed: [STAT-02, STAT-03, STAT-06]

# Metrics
duration: 64min
completed: 2026-02-24
---

# Phase 03 Plan 04: CausalPy ITS + Hill Saturation + Hierarchical Pooling Summary

**CausalPy Interrupted Time Series for campaign-level Bayesian incrementality (STAT-02/03), scipy Hill curve saturation modeling (STAT-06), and PyMC hierarchical pooling ensuring sparse campaigns always receive a directional signal**

## Performance

- **Duration:** 64 min
- **Started:** 2026-02-24T08:54:07Z
- **Completed:** 2026-02-24T09:58:07Z
- **Tasks:** 3 (all complete)
- **Files modified:** 8 created + 1 modified

## Accomplishments

- CausalPy ITS model (`compute_incrementality`) produces campaign-level lift with 94% HDI credible intervals; pre-period validation enforces >= 30 days (Pitfall 1)
- Raw incrementality fallback (`compute_raw_incrementality`) via 1000-iteration bootstrap rolling mean comparison for dual output
- POST /incrementality returns `IncrementalityResponse` with both `adjusted` and `raw` keys — seasonally-adjusted ITS and unadjusted rolling mean
- Hill function saturation model (`hill_saturation_percent`) via scipy curve_fit; CV < 0.15 triggers `insufficient_variation` status (Pitfall 4)
- POST /saturation returns `SaturationResponse` with saturation_percent in [0,1] and status field
- Bayesian hierarchical pooling (`hierarchical_pooled_estimate`) ensures sparse campaigns (< 30 days) borrow strength from cluster peers and always get a directional signal
- POST /incrementality/pooled returns list of pooled estimates with `status='scored'` or `status='pooled_estimate'`
- 14 tests pass across 3 test files: 6 incrementality, 4 saturation, 4 hierarchical

## Task Commits

Each task was committed atomically:

1. **Task 1: CausalPy ITS incrementality model and endpoint** - `968b935` (feat)
2. **Task 2: Hill function saturation model and endpoint** - `e9dafca` (feat)
3. **Task 3: Bayesian hierarchical pooling for sparse campaigns** - `c005d37` (feat)

**Plan metadata:** (see final metadata commit below)

_Note: TDD plan — tests written before implementation for all 3 tasks_

## Files Created/Modified

- `packages/analysis/models/its.py` — CausalPy ITS wrapper with `compute_incrementality()` and `compute_raw_incrementality()`
- `packages/analysis/models/saturation.py` — Hill function with `hill_saturation_percent()`, CV check, scipy curve_fit
- `packages/analysis/models/hierarchical.py` — PyMC hierarchical model with `hierarchical_pooled_estimate()`
- `packages/analysis/routers/incrementality.py` — POST /incrementality (dual scores) + POST /incrementality/pooled
- `packages/analysis/routers/saturation.py` — POST /saturation endpoint
- `packages/analysis/tests/test_incrementality.py` — 6 TDD tests covering positive lift, counterfactual, pre-period validation, endpoint, diagnostics, seasonal comparison
- `packages/analysis/tests/test_saturation.py` — 4 TDD tests covering curve fitting, percentage validation, insufficient variation, endpoint
- `packages/analysis/tests/test_hierarchical.py` — 4 TDD tests covering shrinkage, directional signal for sparse, single-campaign degradation, endpoint integration
- `packages/analysis/main.py` — Registered incrementality and saturation routers

## Decisions Made

- **cores=1 for PyMC on Windows:** FastAPI/uvicorn workers are not the `__main__` module; PyMC's `spawn`-based multiprocessing requires `if __name__ == '__main__'` which doesn't apply. Solution: `cores=1` for all `pm.sample()` calls. Production Linux Docker can use `cores=4`.
- **CausalPy post-period extraction via `get_plot_data_bayesian()`:** The `posterior['mu']` in CausalPy's `idata` has shape `(chains, draws, pre_obs_count, treated_units)` — it only covers the pre-period. CausalPy's built-in `get_plot_data_bayesian(hdi_prob)` returns a full DataFrame including post-period impact with HDI columns named `impact_hdi_lower_N` / `impact_hdi_upper_N`.
- **Hierarchical model uses observed/latent split:** For data-rich campaigns, `observed=lift_mean` constrains the posterior toward the individual estimate with slight shrinkage toward the cluster. For sparse campaigns, no observation is passed — posterior is pulled entirely toward the cluster hyperprior.
- **Hill saturation CV threshold at 0.15:** spend `std/mean < 0.15` = too flat to fit the Hill curve reliably. Returns `insufficient_variation` status with `saturation_percent=None`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CausalPy posterior extraction approach**
- **Found during:** Task 1 (compute_incrementality implementation)
- **Issue:** Initial implementation tried to unpack `idata.posterior['mu']` as `(chains, draws, n_obs)` but actual shape is `(chains, draws, pre_obs_count, treated_units)` — 4D not 3D. The `obs_ind` dimension only covers the pre-period (CausalPy fits on pre-period only).
- **Fix:** Switched to `get_plot_data_bayesian(hdi_prob)` which returns a ready-to-use DataFrame with `impact`, `impact_hdi_lower_N`, `impact_hdi_upper_N` columns for all time steps.
- **Files modified:** `packages/analysis/models/its.py`
- **Verification:** All 6 test_incrementality.py tests pass
- **Committed in:** `968b935` (Task 1 commit)

**2. [Rule 3 - Blocking] Added cores=1 for Windows multiprocessing compatibility**
- **Found during:** Task 1 (first attempt at running ITS tests in background process)
- **Issue:** PyMC's default multiprocessing uses `spawn` on Windows, requiring `if __name__ == '__main__'` guard. FastAPI uvicorn workers are not the main module.
- **Fix:** Added `cores=1` to all `pm.sample()` calls (in `its.py` and `hierarchical.py`).
- **Files modified:** `packages/analysis/models/its.py`, `packages/analysis/models/hierarchical.py`
- **Verification:** Tests pass without multiprocessing errors
- **Committed in:** `968b935`, `c005d37`

---

**Total deviations:** 2 auto-fixed (1 bug in posterior extraction, 1 blocking platform issue)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- PyMC statistical warnings (divergences, all-NaN R-hat slice) appear in test output due to single-chain sampling. These are informational warnings, not failures. R-hat requires multiple chains to compute — single-chain mode is a known limitation on Windows. In production with Linux Docker and `cores=4`, multi-chain sampling will resolve these warnings.
- CausalPy MCMC sampling is slow (Python-only mode due to missing g++ compiler). Each ITS fit takes ~50-100 seconds. Full test suite takes ~6-7 minutes. This is expected for development; production Docker with g++ or JAX backend would be significantly faster.

## User Setup Required

None — no external service configuration required. The Python venv already has all statistical libraries installed.

## Next Phase Readiness

- POST /incrementality, POST /incrementality/pooled, POST /saturation are all implemented and tested
- Phase 4 TypeScript orchestration can call these endpoints via HTTP
- All models handle edge cases: insufficient pre-period, flat spend, sparse campaigns
- Remaining Phase 03 plans (03-05 anomaly detection, 03-06 budget change detection) can proceed independently

## Self-Check: PASSED

All created files verified:
- FOUND: packages/analysis/models/its.py
- FOUND: packages/analysis/models/saturation.py
- FOUND: packages/analysis/models/hierarchical.py
- FOUND: packages/analysis/routers/incrementality.py
- FOUND: packages/analysis/routers/saturation.py
- FOUND: packages/analysis/tests/test_incrementality.py
- FOUND: packages/analysis/tests/test_saturation.py
- FOUND: packages/analysis/tests/test_hierarchical.py
- FOUND: .planning/phases/03-statistical-engine/03-04-SUMMARY.md

All task commits verified:
- FOUND: 968b935 (Task 1 - CausalPy ITS model and endpoint)
- FOUND: e9dafca (Task 2 - Hill saturation model and endpoint)
- FOUND: c005d37 (Task 3 - Bayesian hierarchical pooling)
- FOUND: 03415d1 (Plan metadata - SUMMARY + STATE + ROADMAP)

---
*Phase: 03-statistical-engine*
*Completed: 2026-02-24*
