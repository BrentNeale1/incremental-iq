# Phase 11: Backend Data Quality - Research

**Researched:** 2026-02-27
**Domain:** Backend data correctness — TypeScript ingestion pipeline, Drizzle ORM query layer, Python scoring models
**Confidence:** HIGH (all findings verified from source code inspection)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fix the Drizzle `and()` operator usage — straightforward code correction
- Use the **midpoint of the budget transition period** as the ITS intervention point, not the first day of change
- Only **significant budget changes (>20%)** should trigger ITS analysis
- Scores are used for BOTH display and recommendation logic — accuracy matters
- Tolerate <1% drift between old approximation and direct computation
- If drift is <1%, forward-only fix is acceptable; if >1%, recalculate historical values
- The >20% budget change threshold should be configurable or at least easy to adjust later

### Claude's Discretion
- Duplicate cleanup strategy and prevention mechanism
- Whether to backfill/recalculate historical data (guided by drift analysis)
- ITS reprocessing scope
- User-visible feedback approach (silent vs logged)
- Test coverage depth for each fix

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

## Summary

Phase 11 fixes four distinct backend data correctness bugs. All four are surgical changes to existing code — no new tables, no new endpoints, no schema migrations required. Each bug has been verified by reading the actual source code.

**Bug 1 (Ingestion duplicates):** The `ingestionCoverage` insert in `processMetaSync` (and identically in the other normalizers) uses a plain `INSERT` with no conflict handling. Repeated backfill or sync calls for the same `(tenantId, source, coverageDate)` triple insert new rows each time. The table has no unique constraint defined, meaning the ARCH-03 gate query `COUNT(DISTINCT coverage_date)` still works but `COUNT(*)` queries and raw row counts become inflated. The fix is to add a unique constraint on `(tenant_id, source, coverage_date)` in the schema and convert the insert to an upsert with `ON CONFLICT DO UPDATE`.

**Bug 2 (Global status query):** In `apps/web/app/api/integrations/status/route.ts` line 58-61, the `.where()` clause uses JavaScript `&&` (boolean AND) instead of Drizzle's `and()` function. `inArray(...) && eq(...)` evaluates `inArray(...)` as truthy (it returns a Drizzle SQL object, always truthy in JS), then returns the `eq(...)` result — effectively ignoring the `inArray` condition. The query returns ALL sync runs with `status = 'running'` for the entire database, not just those for the given integration IDs. This causes `runningIntegrationIds` to contain IDs from other tenants, potentially showing incorrect "sync in progress" indicators. The fix is one line: replace `&&` with `and(inArray(...), eq(...))`.

**Bug 3 (Pooled raw score approximation):** In `packages/ingestion/src/scoring/worker.ts` lines 363-373, when a campaign uses hierarchical pooling (sparse data path), the `raw` score object is hand-computed as arithmetic modifications of the pooled result (`lift_mean * 0.95`, `lift_lower * 1.05`, etc.). This is the approximation that should be replaced with a direct computation. The Python `/incrementality/pooled` endpoint only returns a single result set (not dual adjusted/raw). The fix requires the pooled endpoint to return both an `adjusted` and a `raw` score, or the TypeScript worker to call `compute_raw_incrementality` independently for the sparse campaign. Looking at the Python model, `compute_raw_incrementality` is available and can be called directly on the sparse campaign's data — it does not require cluster peers.

**Bug 4 (ITS intervention date for budget-change triggers):** In `packages/ingestion/src/scoring/worker.ts`, the `_getInterventionDate` function uses `metrics.find((m) => m.spend_usd > 0)` (first date of non-zero spend = campaign start) for ALL trigger types, including `budget_change`. The comment on line 616-617 even acknowledges this: "For budget_change triggered jobs, ideally the budget change date would be passed in job data." The `budget_changes` table stores a `changeDate` field. The `ScoringJobData` interface does not carry a `budgetChangeDate` field. The fix requires: (1) add optional `budgetChangeDate` to `ScoringJobData`, (2) pass it when dispatching budget-change scoring jobs, (3) update `_getInterventionDate` to use the midpoint of the transition period when `triggerType === 'budget_change'`.

**Primary recommendation:** Fix all four bugs as isolated, targeted changes. No schema migrations, no new dependencies. Test each fix with unit tests before integration. Determine drift magnitude for bug 3 before deciding on historical backfill.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | already installed | Drizzle `and()` operator for SQL WHERE clauses | Project standard — used in all other routes correctly |
| Drizzle `onConflictDoUpdate` | already installed | Upsert with conflict target | Used in `normalizeMetaInsights` for campaign_metrics — same pattern needed for ingestion_coverage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python `compute_raw_incrementality` | models/its.py | Direct raw score computation | For sparse campaigns instead of arithmetic approximation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Unique constraint + upsert | Application-level dedup (SELECT first, INSERT if missing) | Application dedup has TOCTOU race condition under concurrent writes; DB constraint is atomic |
| Unique constraint + upsert | Drizzle `onConflictDoNothing` | `DO UPDATE` lets us refresh `ingested_at` and `record_count`; `DO NOTHING` silently drops repeated coverage reports |

**Installation:** No new packages required for any fix.

## Architecture Patterns

### Recommended Project Structure
No new files or folders needed. All fixes are in-place edits to existing files:

```
packages/
├── db/src/schema/ingestion-coverage.ts     # Add uniqueIndex for duplicate prevention
├── ingestion/src/normalizers/meta.ts       # Convert coverage insert to upsert
├── ingestion/src/normalizers/google-ads.ts # Same coverage upsert fix
├── ingestion/src/normalizers/shopify.ts    # Same coverage upsert fix
├── ingestion/src/scoring/worker.ts         # Fix _getInterventionDate, fix pooled raw score
├── ingestion/src/scoring/dispatch.ts       # Add budgetChangeDate to ScoringJobData
├── ingestion/src/scoring/budget-detection.ts  # Pass changeDate when enqueueing ITS job
apps/
└── web/app/api/integrations/status/route.ts  # Replace && with and()
packages/
└── analysis/routers/incrementality.py     # Pooled endpoint returns dual adjusted+raw
```

### Pattern 1: Drizzle `and()` for multi-condition WHERE
**What:** Use Drizzle's `and()` SQL builder function, never JavaScript `&&`, when combining WHERE conditions.
**When to use:** Every time you combine two or more Drizzle WHERE expressions.
**Example:**
```typescript
// WRONG (current bug in status/route.ts):
.where(
  inArray(syncRuns.integrationId, integrationIds) &&
  eq(syncRuns.status, 'running'),
)

// CORRECT — already used in the same file for other queries:
import { and, eq, inArray } from 'drizzle-orm';
.where(
  and(
    inArray(syncRuns.integrationId, integrationIds),
    eq(syncRuns.status, 'running'),
  ),
)
```
Note: The file already imports `and` at line 4 and uses it correctly on line 62-65 in `processSyncJob`. The bug is a one-line fix.

### Pattern 2: Upsert for idempotent coverage tracking
**What:** Add a unique constraint on `(tenant_id, source, coverage_date)` in the schema, then use `onConflictDoUpdate` in all normalizers.
**When to use:** Any table where repeated ingestion syncs should update rather than insert duplicate rows.
**Example:**
```typescript
// In ingestion-coverage.ts schema — add uniqueIndex:
import { pgTable, uuid, text, date, timestamp, numeric, uniqueIndex } from 'drizzle-orm/pg-core';

export const ingestionCoverage = pgTable('ingestion_coverage', {
  // ... existing columns
}, (t) => [
  uniqueIndex('ingestion_coverage_tenant_source_date_idx').on(t.tenantId, t.source, t.coverageDate),
  pgPolicy('tenant_isolation', { /* ... existing policy ... */ }),
]);

// In normalizers — convert insert to upsert:
await tx.insert(ingestionCoverage)
  .values({
    tenantId,
    source: 'meta',
    coverageDate,
    status: recordsIngested > 0 ? 'complete' : 'partial',
    recordCount: String(recordsIngested),
  })
  .onConflictDoUpdate({
    target: [ingestionCoverage.tenantId, ingestionCoverage.source, ingestionCoverage.coverageDate],
    set: {
      status: sql`excluded.status`,
      recordCount: sql`excluded.record_count`,
      ingestedAt: sql`NOW()`,
    },
  });
```

### Pattern 3: Midpoint intervention date for budget-change ITS
**What:** When `triggerType === 'budget_change'`, the ITS intervention point is the midpoint between the pre-change and post-change windows, not campaign start.
**When to use:** Budget-change triggered scoring jobs only. Nightly and manual triggers still use campaign start date.
**Example:**
```typescript
// In ScoringJobData — add optional field:
export interface ScoringJobData {
  tenantId: string;
  campaignId: string;
  triggerType: 'nightly' | 'budget_change' | 'manual';
  budgetChangeDate?: string; // ISO date — only set for budget_change triggers
}

// Updated _getInterventionDate:
function _getInterventionDate(
  metrics: MetricRow[],
  triggerType: string,
  budgetChangeDate?: string,
): string {
  if (triggerType === 'budget_change' && budgetChangeDate) {
    return budgetChangeDate; // Already the midpoint (set by detectBudgetChanges)
  }
  // ... existing campaign start date logic
}
```

The `changeDate` in `budget_changes` is currently set to `(CURRENT_DATE - INTERVAL '15 days')::text` — this is already the midpoint of the 28-day detection window (days 28-1 ago, midpoint = 14.5 days ≈ 15 days ago). This value should be passed through when enqueueing the scoring job.

### Pattern 4: Direct pooled raw score computation
**What:** For sparse campaigns taking the hierarchical pooling path, compute the raw score directly using `compute_raw_incrementality` rather than arithmetically deriving it from the pooled adjusted result.
**When to use:** In the TypeScript worker's Step 5b (hierarchical pooling path) and/or in the Python `/incrementality/pooled` endpoint.
**Options:**
- **Option A (Python side):** The `/incrementality/pooled` endpoint in `routers/incrementality.py` is currently typed as returning `list` (untyped). Extend it to also compute and return a `raw` score for the target campaign using `compute_raw_incrementality` with the same intervention date.
- **Option B (TypeScript side):** After `_runHierarchicalPooling` returns the adjusted pooled result, make a separate call to `/incrementality` (standard endpoint) for just the target campaign's raw score, or pass the raw score computation into `_runHierarchicalPooling`.

Option A is cleaner — it keeps all scoring logic in Python. The pooled endpoint response should be extended from a flat list to an object `{ adjusted: ..., raw: ... }` matching the shape of the standard `/incrementality` response for the target campaign.

### Anti-Patterns to Avoid
- **JavaScript `&&` for Drizzle WHERE:** `condition1 && condition2` returns the truthy value of the last expression, not a SQL AND. The `inArray()` call returns a Drizzle SQL object (always truthy), so `inArray() && eq()` silently reduces to just `eq()`.
- **Plain INSERT for idempotency:** Using bare `db.insert(ingestionCoverage).values(...)` without conflict handling means any re-run (retry, backfill re-trigger, incremental sync overlap) adds a duplicate row.
- **Campaign start date as budget-change intervention:** Using first-spend date for budget-change ITS makes the "pre period" span the campaign's entire history instead of the period immediately before the budget shift, corrupting the counterfactual baseline.
- **Arithmetic approximation for raw pooled scores:** `lift_mean * 0.95` etc. produces values that drift from actual rolling-mean-comparison results. The actual difference between methods may be >1% for campaigns with strong seasonal patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Duplicate prevention | Application-level SELECT-then-INSERT | Database unique constraint + onConflictDoUpdate | Atomic, race-condition free, works under concurrent workers |
| Raw incrementality for sparse campaigns | Arithmetic manipulation of pooled result | `compute_raw_incrementality(df, intervention_date)` | Direct computation eliminates systematic bias; already implemented |

**Key insight:** The project already has all the correct tools — `onConflictDoUpdate` is used in `normalizeMetaInsights`, `and()` is imported and used correctly elsewhere in the same file, `compute_raw_incrementality` is fully implemented. These are consistency fixes, not new implementations.

## Common Pitfalls

### Pitfall 1: Schema change requires migration
**What goes wrong:** Adding a `uniqueIndex` to `ingestion-coverage.ts` changes the Drizzle schema but does not automatically apply to the database.
**Why it happens:** Drizzle manages schema-to-migration separately; schema edits are not auto-applied.
**How to avoid:** Generate a new Drizzle migration (or author one manually following the `0003_statistical_engine.sql` pattern from Phase 3). The migration needs `CREATE UNIQUE INDEX IF NOT EXISTS ingestion_coverage_tenant_source_date_idx ON ingestion_coverage (tenant_id, source, coverage_date)`. Name following convention: `0004_ingestion_coverage_unique.sql`.
**Warning signs:** If you only edit the schema file and skip migration generation, the unique constraint exists in TypeScript types but not in the actual database — the upsert conflict target will silently fail or cause runtime errors.

### Pitfall 2: Existing duplicate rows break the new unique constraint
**What goes wrong:** If duplicate rows already exist in `ingestion_coverage`, adding `CREATE UNIQUE INDEX` will fail with "could not create unique index" due to pre-existing duplicates.
**Why it happens:** `CREATE UNIQUE INDEX` requires the column combination to already be unique across all existing rows.
**How to avoid:** The migration must dedup existing rows BEFORE adding the unique index:
```sql
-- Dedup: keep the most recent row for each (tenant_id, source, coverage_date)
DELETE FROM ingestion_coverage
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, source, coverage_date) id
  FROM ingestion_coverage
  ORDER BY tenant_id, source, coverage_date, ingested_at DESC
);
-- Then add unique index
CREATE UNIQUE INDEX IF NOT EXISTS ingestion_coverage_tenant_source_date_idx
  ON ingestion_coverage (tenant_id, source, coverage_date);
```
**Warning signs:** Migration fails with "could not create unique index" — this means duplicates exist.

### Pitfall 3: `inArray` with empty array crashes Postgres
**What goes wrong:** `inArray(syncRuns.integrationId, [])` generates `WHERE integration_id IN ()` which is invalid SQL in PostgreSQL.
**Why it happens:** The bug fix adds `and(inArray(...), eq(...))` — if `integrationIds` is empty (tenant has no integrations), Drizzle generates an invalid query.
**How to avoid:** Add an early return before the `runningSyncs` query when `integrationIds.length === 0` (the route already handles `allIntegrations.length === 0` but falls through). Or guard the query: `integrationIds.length > 0 ? await db.select()... : []`.
**Warning signs:** 500 errors from the status endpoint when a tenant has no integrations.

### Pitfall 4: Budget change threshold discrepancy
**What goes wrong:** The CONTEXT.md says ">20% should trigger ITS analysis" but `budget-detection.ts` currently defaults to `thresholdPct = 0.25` (25%) in `detectBudgetChanges` and there is no explicit filter at the dispatch level.
**Why it happens:** The threshold was set during implementation without the CONTEXT.md decision being recorded.
**How to avoid:** Change `thresholdPct` default from `0.25` to `0.20` in `detectBudgetChanges`, or add a constant `BUDGET_CHANGE_ITS_THRESHOLD = 0.20` that can be configured via environment variable. The CONTEXT.md decision says the threshold should be "configurable or at least easy to adjust later."
**Warning signs:** Budget changes between 20-25% are detected but never trigger ITS analysis.

### Pitfall 5: ITS drift measurement timing
**What goes wrong:** Drift between old approximation and direct computation is evaluated by looking at existing stored scores — but if scores are sparse (many campaigns haven't been scored yet), the drift sample is unrepresentative.
**Why it happens:** The CONTEXT.md decision "if drift is <1%, forward-only fix is acceptable; if >1%, recalculate historical values" requires drift measurement to be meaningful.
**How to avoid:** Compare the arithmetic approximation formula (`lift_mean * 0.95` etc.) against `compute_raw_incrementality` output on a representative sample of synthetic data in a unit test. The Python model is deterministic with fixed seeds — this can be done without a real database.

### Pitfall 6: `budgetChangeDate` not threaded through to scoring dispatch
**What goes wrong:** Adding `budgetChangeDate` to `ScoringJobData` is only useful if the value is actually set when dispatching budget-change scoring jobs.
**Why it happens:** `scanAllCampaignsForBudgetChanges` detects changes and calls `persistBudgetChange`, but the scoring dispatch (`enqueueScoringJob`) is called from `enqueueScoringAfterSync` which only passes `nightly` or `manual` triggers — the budget-change dispatch path needs to be wired separately.
**How to avoid:** Add a dedicated `enqueueScoringForBudgetChange(tenantId, campaignId, changeDate)` function in `dispatch.ts` that passes `triggerType: 'budget_change'` and `budgetChangeDate: changeDate`. Call this from `scanAllCampaignsForBudgetChanges` (or from the scoring worker that processes `budget_changes` table records).

## Code Examples

Verified patterns from source code inspection:

### Bug 2 Fix: Correct Drizzle `and()` usage
```typescript
// Source: apps/web/app/api/integrations/status/route.ts (fix for line 58-61)
// Pattern already used correctly at lines 62-65 in the same file:
const runningSyncs = await db
  .select({ integrationId: syncRuns.integrationId })
  .from(syncRuns)
  .where(
    and(
      inArray(syncRuns.integrationId, integrationIds),
      eq(syncRuns.status, 'running'),
    ),
  );
```

### Bug 1 Fix: Upsert for ingestionCoverage
```typescript
// Source: pattern from packages/ingestion/src/normalizers/meta.ts lines 243-261
// (the same onConflictDoUpdate pattern used for campaign_metrics)
await tx.insert(ingestionCoverage)
  .values({
    tenantId,
    source: 'meta',
    coverageDate,
    status: recordsIngested > 0 ? 'complete' : 'partial',
    recordCount: String(recordsIngested),
  })
  .onConflictDoUpdate({
    target: [
      ingestionCoverage.tenantId,
      ingestionCoverage.source,
      ingestionCoverage.coverageDate,
    ],
    set: {
      status: sql`excluded.status`,
      recordCount: sql`excluded.record_count`,
      ingestedAt: sql`NOW()`,
    },
  });
```

### Bug 3 Fix: Direct raw score for pooled campaigns (Python)
```python
# Source: packages/analysis/models/its.py — compute_raw_incrementality already exists
# In routers/incrementality.py pooled endpoint, for the target campaign:
from models.its import compute_raw_incrementality

# After hierarchical_pooled_estimate returns, for the target campaign:
target_metrics_df = pd.DataFrame(target_campaign["metrics"])
target_metrics_df["date"] = pd.to_datetime(target_metrics_df["date"]).dt.date
target_intervention = date.fromisoformat(target_campaign["intervention_date"])
raw_result = compute_raw_incrementality(target_metrics_df, target_intervention)
```

### Bug 4 Fix: Midpoint intervention date for budget-change trigger
```typescript
// Source: packages/ingestion/src/scoring/budget-detection.ts line 121
// changeDate is already set to midpoint: (CURRENT_DATE - INTERVAL '15 days')::text
// This needs to be threaded through to the scoring job:

// In dispatch.ts:
export interface ScoringJobData {
  tenantId: string;
  campaignId: string;
  triggerType: 'nightly' | 'budget_change' | 'manual';
  budgetChangeDate?: string; // ISO date string, only for budget_change trigger
}

// In worker.ts _getInterventionDate:
function _getInterventionDate(
  metrics: MetricRow[],
  triggerType: string,
  budgetChangeDate?: string,
): string {
  if (triggerType === 'budget_change' && budgetChangeDate) {
    return budgetChangeDate; // Midpoint already computed by detectBudgetChanges
  }
  const firstSpend = metrics.find((m) => m.spend_usd > 0);
  if (firstSpend) return firstSpend.date;
  // ... rest of existing logic
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plain INSERT for coverage | Upsert with unique constraint | Phase 11 | Prevents duplicate rows on retry/re-sync |
| JavaScript `&&` for query conditions | Drizzle `and()` operator | Phase 11 (bug fix) | Correct multi-condition filtering |
| Arithmetic approximation for pooled raw | Direct `compute_raw_incrementality` call | Phase 11 | Eliminates systematic bias in raw scores |
| Campaign start date for budget-change ITS | Midpoint of transition period | Phase 11 | Correct counterfactual baseline for budget analysis |

**Deprecated/outdated in this phase:**
- The `@ts-ignore` comment on line 58 of `status/route.ts` should be removed once `&&` is replaced with `and()` — the type inference issue was masking the logic bug.

## Open Questions

1. **Drift magnitude for pooled raw score approximation**
   - What we know: The current code uses `lift_mean * 0.95`, `lift_lower * 1.05`, `lift_upper * 0.95`, `confidence * 0.9` as approximations
   - What's unclear: Whether this systematically drifts >1% from `compute_raw_incrementality` output on real campaign data
   - Recommendation: Write a unit test comparing the arithmetic formula vs `compute_raw_incrementality` on synthetic data with controlled inputs. If drift < 1% on all test cases, no historical backfill needed. If drift > 1%, reprocess all `pooled_estimate` rows in `incrementality_scores` where `score_type = 'raw'`.

2. **Where does budget-change scoring get dispatched today?**
   - What we know: `scanAllCampaignsForBudgetChanges` detects and persists budget changes, but `enqueueScoringAfterSync` only enqueues nightly scoring for all active campaigns — it does not dispatch targeted per-budget-change ITS jobs
   - What's unclear: Is there a separate path that reads `budget_changes` table with `status='pending_analysis'` and dispatches per-change ITS jobs? The code search did not reveal one.
   - Recommendation: The current implementation detects budget changes and saves them to the DB, but the dedicated ITS-for-budget-change scoring path may not be wired. Phase 11 may need to implement that dispatch path.

3. **Are Google Ads and Shopify normalizers identical to Meta for coverage inserts?**
   - What we know: The Meta normalizer has been read in detail. Google Ads and Shopify are assumed to follow the same pattern based on the `processGoogleAdsSync` and `processShopifySync` function signatures.
   - Recommendation: Read both normalizers during plan execution to verify before applying the same fix.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (Python, packages/analysis/tests/) |
| Config file | none detected — pytest discovers by convention |
| Quick run command | `cd packages/analysis && uv run pytest tests/ -x -q` |
| Full suite command | `cd packages/analysis && uv run pytest tests/ -v` |
| Estimated runtime | ~60-120 seconds (ITS model fitting is slow) |

**Note:** No TypeScript test infrastructure detected in the project. The TypeScript fixes (bugs 1, 2, 4) will be verified through manual integration testing patterns consistent with prior phases (UAT-style verification).

### Phase Requirements → Test Map
| Success Criterion | Behavior | Test Type | File |
|-------------------|----------|-----------|------|
| No duplicate rows in ingestion_coverage | Repeated sync calls with same date range produce single row per (tenant, source, date) | unit | `packages/analysis/tests/` — N/A (TypeScript logic). Verify via manual DB inspection or integration test |
| Global status route uses `and()` | Query only returns running syncs for the given integration IDs | unit | TypeScript — manual verification by inspecting generated SQL |
| Pooled raw score directly computed | Raw score for pooled campaign matches `compute_raw_incrementality` within 0.1% | unit Python | `packages/analysis/tests/test_incrementality.py` — extend with pooled raw test |
| Budget-change ITS uses midpoint date | `_getInterventionDate` returns `budgetChangeDate` when triggerType is 'budget_change' | unit TypeScript | N/A — verify with manual test or new TypeScript test |

### Nyquist Sampling Rate
- **Minimum sample interval:** After each task — run `cd packages/analysis && uv run pytest tests/test_incrementality.py -x -q` (~30 seconds for non-ITS tests)
- **Full suite trigger:** Before final task completes — run full `pytest tests/ -v`
- **Phase-complete gate:** Full suite green + manual smoke test of status endpoint
- **Estimated feedback latency per task:** ~30 seconds for fast tests, ~90 seconds for ITS model tests

### Wave 0 Gaps (must be created before implementation)
- [ ] `packages/analysis/tests/test_incrementality.py` — add `test_pooled_raw_score_direct_computation` test to verify raw score matches `compute_raw_incrementality` directly
- [ ] TypeScript test for `_getInterventionDate` — new unit test file or inline verification; tests that `budget_change` trigger uses `budgetChangeDate` param and `nightly` trigger uses first-spend date

## Sources

### Primary (HIGH confidence)
- Source code inspection — `packages/db/src/schema/ingestion-coverage.ts` — no unique constraint on (tenant_id, source, coverage_date)
- Source code inspection — `packages/ingestion/src/normalizers/meta.ts` lines 510-519 — plain INSERT with no conflict handling for ingestion_coverage
- Source code inspection — `apps/web/app/api/integrations/status/route.ts` lines 54-62 — `&&` instead of `and()` for WHERE clause
- Source code inspection — `packages/ingestion/src/scoring/worker.ts` lines 363-373 — arithmetic raw score approximation
- Source code inspection — `packages/ingestion/src/scoring/worker.ts` lines 618-638 — `_getInterventionDate` ignores `triggerType`
- Source code inspection — `packages/ingestion/src/scoring/budget-detection.ts` line 121 — `changeDate` is already the midpoint (`CURRENT_DATE - INTERVAL '15 days'`)
- Source code inspection — `packages/analysis/models/its.py` — `compute_raw_incrementality` is fully implemented
- Source code inspection — `packages/analysis/routers/incrementality.py` lines 73-136 — pooled endpoint returns untyped list, no `raw` score

### Secondary (MEDIUM confidence)
- Drizzle ORM behavior: `&&` between Drizzle SQL objects evaluates as JavaScript boolean AND, returning the last truthy value — verified by understanding JavaScript's `&&` operator semantics applied to Drizzle's non-null SQL objects.
- PostgreSQL `CREATE UNIQUE INDEX` behavior: fails when duplicates exist — standard PostgreSQL behavior.

### Tertiary (LOW confidence)
- Assumption that Google Ads and Shopify normalizers follow identical coverage-insert pattern to Meta normalizer — needs verification during plan execution.

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — all four bugs verified by reading source code directly
- Fix approach: HIGH — patterns already exist in the codebase (upsert in campaign_metrics, and() used in same file, compute_raw_incrementality implemented)
- Migration approach: HIGH — follows established pattern (manual SQL file, dedup before unique index)
- Drift magnitude: LOW — requires running compute to measure; decision deferred to plan execution
- Budget-change dispatch wiring: MEDIUM — code paths traced but full dispatch flow not confirmed end-to-end

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable codebase, no external API changes involved)
