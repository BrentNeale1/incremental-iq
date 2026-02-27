---
phase: 11-backend-data-quality
plan: 02
subsystem: api
tags: [python, fastapi, pydantic, typescript, bullmq, causalpy, incrementality, bayesian]

# Dependency graph
requires:
  - phase: 11-backend-data-quality-01
    provides: plan 11-01 research and context identifying the two scoring precision bugs
  - phase: 03-statistical-engine
    provides: compute_raw_incrementality, hierarchical_pooled_estimate, ITS scoring pipeline
provides:
  - Pooled incrementality endpoint returns dual {adjusted, raw, all_results} response with raw via compute_raw_incrementality
  - Budget-change triggered ITS uses actual budget change date as intervention point (not campaign start)
  - Budget change detection threshold configurable via BUDGET_CHANGE_THRESHOLD env var (default 0.20)
  - PooledIncrementalityResponse and PooledCampaignResult Pydantic schemas
affects: [scoring-worker, budget-detection, dispatch, incrementality-endpoint, recommendations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dual adjusted+raw response pattern extended to pooled endpoint (matching individual /incrementality endpoint shape)
    - budgetChangeDate threaded through dispatch → workers.ts → worker.ts → _getInterventionDate
    - Env-var-configurable threshold with module-level constant: parseFloat(process.env.X ?? 'default')

key-files:
  created: []
  modified:
    - packages/analysis/schemas/responses.py
    - packages/analysis/routers/incrementality.py
    - packages/analysis/tests/test_incrementality.py
    - packages/ingestion/src/scoring/worker.ts
    - packages/ingestion/src/scoring/dispatch.ts
    - packages/ingestion/src/scoring/budget-detection.ts
    - packages/ingestion/src/scheduler/workers.ts

key-decisions:
  - "PooledIncrementalityResponse returns {adjusted, raw, all_results} not flat list — same dual-score contract as /incrementality endpoint"
  - "raw score in pooled response computed via compute_raw_incrementality on target campaign's own metrics — eliminates arithmetic approximation bias"
  - "budgetChangeDate is optional in ScoringJobData (only set for budget_change triggers) — backwards compatible with existing nightly/manual jobs"
  - "BUDGET_CHANGE_THRESHOLD env var makes threshold operator-configurable without code deploy — default 0.20 per user decision"
  - "target_campaign_id added to PooledRequest so Python endpoint can identify which campaign needs raw computation"

patterns-established:
  - "Env-var threshold pattern: module-level const with parseFloat(process.env.X ?? 'default') and function parameter default referencing the const"
  - "Dual score response pattern: all scoring endpoints (individual and pooled) return {adjusted, raw} shape consistently"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-02-27
---

# Phase 11 Plan 02: Backend Data Quality Summary

**Dual adjusted+raw scores for pooled endpoint via compute_raw_incrementality, replacing lift_mean*0.95 arithmetic approximation; budget-change ITS now uses actual change date as intervention point with configurable 20% threshold**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-27T05:10:13Z
- **Completed:** 2026-02-27T05:25:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Eliminated arithmetic approximation (`lift_mean * 0.95`, `lift_lower * 1.05`, etc.) from pooled scoring path — raw scores now computed directly via `compute_raw_incrementality`
- Wired actual budget change date as ITS intervention point for budget-change triggered scoring jobs, fixing corrupted counterfactual baselines
- Changed budget change detection threshold from 25% to 20% per user decision, configurable via `BUDGET_CHANGE_THRESHOLD` env var
- Added `PooledCampaignResult` and `PooledIncrementalityResponse` Pydantic schemas and `test_pooled_returns_dual_scores` test (verified passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend pooled endpoint to return dual adjusted+raw scores and add test** - `15a6c71` (feat)
2. **Task 2: Wire budget change date as ITS intervention point and fix threshold** - `0ff35d2` (feat)

**Plan metadata:** (created next)

## Files Created/Modified
- `packages/analysis/schemas/responses.py` - Added PooledCampaignResult and PooledIncrementalityResponse Pydantic models; added Any and ConfigDict imports
- `packages/analysis/routers/incrementality.py` - Rewrote /incrementality/pooled to return {adjusted, raw, all_results}; added PooledIncrementalityResponse response_model; raw computed via compute_raw_incrementality
- `packages/analysis/tests/test_incrementality.py` - Added test_pooled_returns_dual_scores verifying dual response shape and non-arithmetic raw computation
- `packages/ingestion/src/scoring/worker.ts` - Added target_campaign_id to PooledRequest; updated _runHierarchicalPooling return type to {adjusted, raw}; removed arithmetic approximation from processScoringJob; destructured budgetChangeDate from job.data; updated _getInterventionDate to use budgetChangeDate for budget_change triggers
- `packages/ingestion/src/scoring/dispatch.ts` - Added budgetChangeDate optional field to ScoringJobData; updated enqueueScoringJob to accept and pass budgetChangeDate
- `packages/ingestion/src/scoring/budget-detection.ts` - Added BUDGET_CHANGE_THRESHOLD module constant (env-configurable, default 0.20); changed detectBudgetChanges default threshold from 0.25 to BUDGET_CHANGE_THRESHOLD
- `packages/ingestion/src/scheduler/workers.ts` - Updated budget_change enqueue call to pass change.changeDate as budgetChangeDate

## Decisions Made
- PooledIncrementalityResponse returns `{adjusted, raw, all_results}` not a flat list — consistent with the individual `/incrementality` endpoint's dual-score contract
- `raw` score computed via `compute_raw_incrementality` on the target campaign's own metrics — the only correct way to get an unbiased raw estimate (arithmetic approximation from adjusted introduces systematic bias)
- `budgetChangeDate` is optional in `ScoringJobData` so nightly/manual jobs remain backwards compatible — only budget_change triggers set it
- `BUDGET_CHANGE_THRESHOLD` env var makes the 20% threshold operator-configurable without a code deploy

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- `uv` command not on PATH in bash shell; resolved by using full path `/c/Users/brent/AppData/Local/Python/pythoncore-3.14-64/Scripts/uv.exe`
- Pre-existing TypeScript errors in packages/ingestion (`.rows` on RowList, missing `enqueueFullTenantScoring` export) noted as out-of-scope and logged to deferred-items.md. The `budgetChangeDate` TS error from the baseline was resolved by Task 2 changes.

## User Setup Required
None — no external service configuration required. `BUDGET_CHANGE_THRESHOLD` is optional (defaults to 0.20).

## Self-Check: PASSED

All files exist. All commits verified (15a6c71, 0ff35d2).

## Next Phase Readiness
- Phase 11 Plan 02 complete; scoring pipeline now uses correct raw scores for pooled campaigns and correct intervention dates for budget-change triggered jobs
- Scoring precision bugs identified in Phase 11 research are fixed
- Deferred: pre-existing `.rows` TS type errors in packages/ingestion and missing `enqueueFullTenantScoring` export remain as known issues (logged in deferred-items.md)

---
*Phase: 11-backend-data-quality*
*Completed: 2026-02-27*
