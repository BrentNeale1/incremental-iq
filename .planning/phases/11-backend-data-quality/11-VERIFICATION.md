---
phase: 11-backend-data-quality
verified: 2026-02-27T06:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
human_verification: []
---

# Phase 11: Backend Data Quality Verification Report

**Phase Goal:** Fix backend data correctness issues — duplicate row prevention, query bug fix, scoring precision improvements
**Verified:** 2026-02-27T06:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                  | Status     | Evidence                                                                                                    |
| --- | -------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Repeated ingestion syncs do not insert duplicate rows into ingestion_coverage          | VERIFIED | `uniqueIndex` in schema + `onConflictDoUpdate` in all 4 normalizers + migration 0008 with dedup DELETE      |
| 2   | Global status route uses correct Drizzle `and()` operator instead of JavaScript `&&`  | VERIFIED | `and(inArray(...), eq(...))` at line 60 of status route; `@ts-ignore` removed; empty-array guard added      |
| 3   | Pooled raw score is computed directly via `compute_raw_incrementality`, not arithmetic | VERIFIED | `/incrementality/pooled` calls `_compute_raw_for_campaign` → `compute_raw_incrementality`; no `lift_mean * 0.95` remains |
| 4   | Budget-change triggered ITS jobs use actual budget change date as intervention point   | VERIFIED | `_getInterventionDate` returns `budgetChangeDate` when `triggerType === 'budget_change'`; workers.ts passes `change.changeDate` |

**Score:** 4/4 truths verified

---

## Required Artifacts

### Plan 11-01 Artifacts

| Artifact                                                                     | Expected                                            | Status     | Details                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/ingestion-coverage.ts`                               | uniqueIndex on (tenantId, source, coverageDate)     | VERIFIED | Line 34: `uniqueIndex('ingestion_coverage_tenant_source_date_idx').on(t.tenantId, t.source, t.coverageDate)` |
| `packages/db/migrations/0008_ingestion_coverage_unique.sql`                  | Migration with dedup DELETE + CREATE UNIQUE INDEX   | VERIFIED | File exists at correct path; contains both DELETE and `CREATE UNIQUE INDEX IF NOT EXISTS`    |
| `packages/ingestion/src/normalizers/meta.ts`                                 | Upsert with onConflictDoUpdate on ingestionCoverage | VERIFIED | Lines 518-525: `onConflictDoUpdate` with target `[tenantId, source, coverageDate]`           |
| `packages/ingestion/src/normalizers/google-ads.ts`                           | Upsert with onConflictDoUpdate on ingestionCoverage | VERIFIED | Lines 404-409: `onConflictDoUpdate` with matching target                                     |
| `packages/ingestion/src/normalizers/shopify.ts`                              | Upsert with onConflictDoUpdate on ingestionCoverage | VERIFIED | Lines 428-433: `onConflictDoUpdate` with matching target                                     |
| `packages/ingestion/src/normalizers/ga4.ts`                                  | Upsert with onConflictDoUpdate on ingestionCoverage | VERIFIED | Lines 370-375: `onConflictDoUpdate` with matching target                                     |
| `apps/web/app/api/integrations/status/route.ts`                              | Correct Drizzle and() usage in WHERE clause         | VERIFIED | Line 4: `and` imported; lines 60-63: `and(inArray(...), eq(...))`; no `@ts-ignore`          |

### Plan 11-02 Artifacts

| Artifact                                                         | Expected                                                    | Status     | Details                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/analysis/routers/incrementality.py`                    | Pooled endpoint returns {adjusted, raw, all_results}        | VERIFIED | Line 77: `response_model=PooledIncrementalityResponse`; `_compute_raw_for_campaign` calls `compute_raw_incrementality` |
| `packages/ingestion/src/scoring/worker.ts`                       | Worker consumes dual pooled response; uses budgetChangeDate | VERIFIED | Lines 605-640: structured `{adjusted, raw}` callSidecar response; line 319: `_getInterventionDate` with `budgetChangeDate` |
| `packages/ingestion/src/scoring/dispatch.ts`                     | ScoringJobData includes optional budgetChangeDate field     | VERIFIED | Lines 40-46: `budgetChangeDate?: string` in `ScoringJobData`; line 74: param in `enqueueScoringJob`       |
| `packages/ingestion/src/scoring/budget-detection.ts`             | Threshold default 0.20 (not 0.25)                          | VERIFIED | Lines 34-36: `parseFloat(process.env.BUDGET_CHANGE_THRESHOLD ?? '0.20')`                                 |
| `packages/analysis/tests/test_incrementality.py`                 | test_pooled_returns_dual_scores present                     | VERIFIED | Lines 278-375: complete test verifying `adjusted`, `raw`, `all_results` keys and non-arithmetic raw value |
| `packages/analysis/schemas/responses.py`                         | PooledCampaignResult and PooledIncrementalityResponse models | VERIFIED | Lines 176-213: both models defined with correct fields and `extra="allow"` config                         |
| `packages/ingestion/src/scheduler/workers.ts`                    | Budget change dispatch passes change.changeDate             | VERIFIED | Line 90: `enqueueScoringJob(tenantId, change.campaignId, 'budget_change', change.changeDate)`             |

---

## Key Link Verification

### Plan 11-01 Key Links

| From                                          | To                                                        | Via                                                   | Status     | Details                                                                                  |
| --------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `packages/db/src/schema/ingestion-coverage.ts` | `packages/db/migrations/0008_ingestion_coverage_unique.sql` | Schema uniqueIndex name matches migration index name | VERIFIED | Both use `ingestion_coverage_tenant_source_date_idx`                                     |
| `packages/ingestion/src/normalizers/meta.ts`  | `packages/db/src/schema/ingestion-coverage.ts`            | `onConflictDoUpdate` target references uniqueIndex columns | VERIFIED | Target: `[ingestionCoverage.tenantId, ingestionCoverage.source, ingestionCoverage.coverageDate]` |

### Plan 11-02 Key Links

| From                                            | To                                                        | Via                                                       | Status     | Details                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `packages/ingestion/src/scoring/worker.ts`      | `packages/analysis/routers/incrementality.py`             | callSidecar('/incrementality/pooled') consuming {adjusted, raw} | VERIFIED | Lines 605-640: typed callSidecar consuming `pooledResponse.adjusted.*` and `pooledResponse.raw.*` |
| `packages/ingestion/src/scheduler/workers.ts`   | `packages/ingestion/src/scoring/dispatch.ts`              | enqueueScoringJob passes budgetChangeDate from BudgetChangeEvent | VERIFIED | Line 90: `enqueueScoringJob(..., 'budget_change', change.changeDate)`                           |
| `packages/ingestion/src/scoring/worker.ts`      | `packages/ingestion/src/scoring/dispatch.ts`              | `_getInterventionDate` reads budgetChangeDate from ScoringJobData | VERIFIED | Line 157: destructures `budgetChangeDate` from `job.data`; line 658: uses it when `triggerType === 'budget_change'` |

---

## Requirements Coverage

Both plans declare `requirements: []` — this is a tech debt / gap closure phase with no formal requirement IDs assigned. No entries exist in `.planning/REQUIREMENTS.md` mapping any requirement ID to Phase 11. Requirements coverage check: N/A.

---

## Anti-Patterns Found

None. Scanned all 9 modified files for:
- TODO / FIXME / XXX / HACK comments
- Placeholder or stub implementations
- Arithmetic approximation remnants (`lift_mean * 0.95`)
- `@ts-ignore` comments in modified files
- Empty handlers or return stubs

All clear.

---

## Commit Verification

All 4 task commits documented in SUMMARYs are present in git history:

| Commit    | Plan  | Task                                                            |
| --------- | ----- | --------------------------------------------------------------- |
| `94845ea` | 11-01 | feat: add uniqueIndex to ingestion_coverage and upsert normalizers |
| `64736de` | 11-01 | fix: fix Drizzle and() query bug in global status route         |
| `15a6c71` | 11-02 | feat: extend pooled endpoint to return dual adjusted+raw scores |
| `0ff35d2` | 11-02 | feat: wire budget change date as ITS intervention point and fix threshold |

---

## Notable Implementation Details

1. **Migration path correction (11-01):** Plan specified `packages/db/drizzle/` but the actual migration directory is `packages/db/migrations/` per `drizzle.config.ts`. The SUMMARY correctly documents this correction — migration is at the right path.

2. **Fallback path in pooled endpoint:** When `compute_raw_incrementality` raises an exception for a target campaign (e.g., too sparse even for raw computation), the endpoint falls back to pooled values with 0.9x confidence reduction. This is a correct defensive pattern — the primary path (direct computation) is the goal and is implemented.

3. **Threshold change documented:** `budget-detection.ts` explicitly notes `Previous value: 0.25 (25%) — changed to 0.20 (20%) per user decision` in the module comment, providing audit trail.

4. **Pre-existing TS errors not introduced:** SUMMARY notes pre-existing TypeScript errors in `apps/web` (signup actions, markets route, emails) and `packages/ingestion` (`.rows` on RowList, missing `enqueueFullTenantScoring` export). These are out of scope and not caused by Phase 11 changes.

---

## Human Verification Required

None. All four success criteria are verifiable programmatically via code inspection. The test `test_pooled_returns_dual_scores` provides runtime validation of the pooled endpoint behavior (assertion 6 explicitly checks that raw is not an arithmetic approximation of adjusted * 0.95).

---

## Summary

Phase 11 achieved all four goal criteria:

1. **Duplicate prevention** — `uniqueIndex` in schema, `onConflictDoUpdate` in all 4 normalizers, and migration 0008 collectively guarantee idempotent ingestion_coverage writes. A repeated sync for the same `(tenantId, source, date)` will update the existing row rather than insert a duplicate.

2. **Query bug fix** — The status route's `&&` operator (which JavaScript evaluates to a boolean, discarding the `inArray` condition entirely) is replaced with Drizzle's `and()` compositor. The route now correctly filters `syncRuns` by both tenant integration IDs and running status. The `@ts-ignore` comment is gone and an empty-array guard prevents invalid SQL.

3. **Pooled raw score precision** — The pooled endpoint now calls `compute_raw_incrementality` directly on the target campaign's metrics and returns `{adjusted, raw, all_results}`. The arithmetic approximation (`lift_mean * 0.95` etc.) no longer exists anywhere in the codebase. The test asserts this explicitly.

4. **Budget change intervention date** — `budgetChangeDate` is threaded from `detectBudgetChanges` → `workers.ts` → `enqueueScoringJob` → `ScoringJobData` → `processScoringJob` → `_getInterventionDate`. Budget-change triggered jobs now use the actual change midpoint date rather than campaign start date.

---

_Verified: 2026-02-27T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
