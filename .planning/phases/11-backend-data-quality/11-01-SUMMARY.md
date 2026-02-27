---
phase: 11-backend-data-quality
plan: 01
subsystem: database
tags: [drizzle-orm, postgres, unique-constraint, upsert, ingestion, data-integrity]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: ingestion_coverage table, 4 normalizers (meta, google-ads, shopify, ga4)
  - phase: 06-authentication
    provides: session-based tenantId in API routes
provides:
  - uniqueIndex on ingestion_coverage (tenantId, source, coverageDate)
  - Idempotent upsert coverage inserts in all 4 normalizers
  - Correct Drizzle and() usage in global status route
  - Migration 0008 with dedup DELETE + CREATE UNIQUE INDEX
affects: [12-production-deploy, any-phase-using-ingestion-coverage, any-phase-reading-sync-status]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ingestionCoverage inserts use onConflictDoUpdate with (tenantId, source, coverageDate) target — same pattern as campaignMetrics upserts"
    - "Drizzle WHERE clause uses and(condition1, condition2) not && — JavaScript && evaluates to one condition, discarding the other"
    - "Empty array guard before inArray() prevents Drizzle/Postgres error on inArray(col, [])"

key-files:
  created:
    - packages/db/migrations/0008_ingestion_coverage_unique.sql
  modified:
    - packages/db/src/schema/ingestion-coverage.ts
    - packages/ingestion/src/normalizers/meta.ts
    - packages/ingestion/src/normalizers/google-ads.ts
    - packages/ingestion/src/normalizers/shopify.ts
    - packages/ingestion/src/normalizers/ga4.ts
    - apps/web/app/api/integrations/status/route.ts

key-decisions:
  - "Migration path is packages/db/migrations/ (not packages/db/drizzle/ as stated in plan) — drizzle.config.ts out: './migrations' is the source of truth"
  - "Migration deduplicates existing rows via DISTINCT ON before adding unique index — prevents constraint violation on existing data"
  - "Status route uses and() with empty-array guard — integrationIds guard prevents inArray(col, []) which Postgres rejects"
  - "onConflictDoUpdate for coverage uses sql template literals for excluded.status, excluded.record_count, NOW() — same pattern as campaign_metrics upserts"

patterns-established:
  - "ingestionCoverage upsert pattern: onConflictDoUpdate target=[tenantId, source, coverageDate] set={status, recordCount, ingestedAt}"
  - "Drizzle multi-condition WHERE: always use and(cond1, cond2) — never && which JavaScript short-circuits to boolean"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-02-27
---

# Phase 11 Plan 01: Data Integrity Fixes Summary

**Unique constraint on ingestion_coverage with upsert normalizers prevents duplicate rows on re-sync; Drizzle and() fix in status route prevents cross-tenant sync status leakage**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-27T05:10:56Z
- **Completed:** 2026-02-27T05:13:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `uniqueIndex('ingestion_coverage_tenant_source_date_idx')` on `(tenantId, source, coverageDate)` to schema, preventing repeated sync runs from creating duplicate coverage rows
- Created migration 0008 with dedup DELETE (DISTINCT ON) before CREATE UNIQUE INDEX — safe for existing data
- Converted all 4 normalizer ingestionCoverage inserts to `onConflictDoUpdate` — idempotent syncs for meta, google_ads, shopify, and ga4
- Fixed JavaScript `&&` bug in status route `.where()` clause replaced with Drizzle `and()`, plus added empty-array guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Add unique constraint to ingestion_coverage and convert normalizer inserts to upserts** - `94845ea` (feat)
2. **Task 2: Fix Drizzle and() query bug in global status route** - `64736de` (fix)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `packages/db/src/schema/ingestion-coverage.ts` - Added `uniqueIndex` import and `uniqueIndex('ingestion_coverage_tenant_source_date_idx').on(t.tenantId, t.source, t.coverageDate)` to table definition
- `packages/db/migrations/0008_ingestion_coverage_unique.sql` - Manual migration: dedup DELETE with DISTINCT ON, then CREATE UNIQUE INDEX
- `packages/ingestion/src/normalizers/meta.ts` - Coverage insert converted to upsert with `onConflictDoUpdate`
- `packages/ingestion/src/normalizers/google-ads.ts` - Coverage insert converted to upsert with `onConflictDoUpdate`
- `packages/ingestion/src/normalizers/shopify.ts` - Coverage insert converted to upsert with `onConflictDoUpdate`
- `packages/ingestion/src/normalizers/ga4.ts` - Coverage insert converted to upsert with `onConflictDoUpdate`
- `apps/web/app/api/integrations/status/route.ts` - Added `and` import, replaced `&&` with `and()`, removed `@ts-ignore`, added empty-array guard

## Decisions Made
- Migration file goes in `packages/db/migrations/` (not `packages/db/drizzle/` as the plan stated) — `drizzle.config.ts` sets `out: './migrations'` as the canonical output directory
- Dedup DELETE uses `DISTINCT ON (tenant_id, source, coverage_date)` ordered by `ingested_at DESC` — keeps most recent row per combination
- Empty integrationIds guard wraps the runningSyncs query — prevents `inArray(col, [])` which would produce invalid SQL

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected migration file path from plan**
- **Found during:** Task 1 (schema and migration creation)
- **Issue:** Plan specified `packages/db/drizzle/0008_ingestion_coverage_unique.sql` but the actual migration directory is `packages/db/migrations/` per `drizzle.config.ts`
- **Fix:** Created migration at `packages/db/migrations/0008_ingestion_coverage_unique.sql` (correct path)
- **Files modified:** `packages/db/migrations/0008_ingestion_coverage_unique.sql`
- **Verification:** File exists at correct path, consistent with all previous migrations (0000-0007)
- **Committed in:** 94845ea (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - incorrect path in plan corrected)
**Impact on plan:** Necessary correction; wrong directory would mean migration tool never finds the file. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `apps/web` (signup actions, markets route, emails, scoring package) were present before Phase 11. None are in files modified by this plan. Documented in `deferred-items.md`. The `integrations/status/route.ts` file compiles cleanly.

## User Setup Required
None — migration `0008_ingestion_coverage_unique.sql` must be applied to the database, but this is handled as part of the standard deployment migration process.

## Next Phase Readiness
- Plan 11-01 complete: ingestion_coverage is now idempotent-safe and the status route correctly scopes queries to the tenant's integrations
- Ready for Plan 11-02 (next data quality improvement in this phase)

---
*Phase: 11-backend-data-quality*
*Completed: 2026-02-27*

## Self-Check: PASSED

- FOUND: packages/db/src/schema/ingestion-coverage.ts
- FOUND: packages/db/migrations/0008_ingestion_coverage_unique.sql
- FOUND: packages/ingestion/src/normalizers/meta.ts
- FOUND: packages/ingestion/src/normalizers/google-ads.ts
- FOUND: packages/ingestion/src/normalizers/shopify.ts
- FOUND: packages/ingestion/src/normalizers/ga4.ts
- FOUND: apps/web/app/api/integrations/status/route.ts
- FOUND commit: 94845ea (Task 1)
- FOUND commit: 64736de (Task 2)
