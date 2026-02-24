---
phase: 01-data-architecture
plan: 02
subsystem: database
tags: [drizzle-orm, drizzle-kit, postgres, rls, timescaledb, migrations, hypertables]

# Dependency graph
requires:
  - phase: 01-data-architecture
    plan: 01
    provides: "packages/db TypeScript package with drizzle-orm schema definitions for all 8 tables"
provides:
  - "packages/db/migrations/0000_aberrant_namora.sql: Drizzle-generated DDL for all 8 tables, ENABLE/FORCE ROW LEVEL SECURITY on 7 tenant tables, restrictive RLS policies for app_user role, unique index on campaign_metrics"
  - "packages/db/migrations/0001_hypertables.sql: TimescaleDB extension enable, hypertable conversion for campaign_metrics (1-month chunks) and raw_api_pulls (1-week chunks), compression policy for campaign_metrics (90-day threshold)"
  - "packages/db/src/migrate.ts: Non-pooling migration runner script using drizzle-orm/postgres-js/migrator"
  - "pnpm db:migrate script: tsx src/migrate.ts for running migrations against any DATABASE_URL"
affects:
  - "02-ingestion: must run migrations before any data writes to campaign_metrics or raw_api_pulls"
  - "03-statistics-engine: hypertable compression settings affect time-range query performance patterns"
  - "infra: must create app_user PostgreSQL role before running migrations"

# Tech tracking
tech-stack:
  added:
    - "tsx 4.21.0 — TypeScript execution for migration runner without pre-compilation step"
  patterns:
    - "Migration generation: drizzle-kit generate (NOT push) preserves RLS policy diffs"
    - "Custom migrations: drizzle-kit generate --custom --name=X for TimescaleDB operations outside Drizzle schema"
    - "FORCE ROW LEVEL SECURITY: appended to Drizzle-generated init migration to prevent table owner bypass"
    - "Hypertable conversion after table creation: 0001 depends on 0000, enforced by migration sequencing"
    - "Non-pooling migration client: postgres(url, { max: 1 }) ensures sequential migration execution"

key-files:
  created:
    - "packages/db/migrations/0000_aberrant_namora.sql"
    - "packages/db/migrations/0001_hypertables.sql"
    - "packages/db/migrations/meta/_journal.json"
    - "packages/db/src/migrate.ts"
  modified:
    - "packages/db/package.json"
    - "packages/db/src/schema/index.ts"
    - "packages/db/src/schema/campaigns.ts"
    - "packages/db/src/schema/creatives.ts"
    - "packages/db/src/schema/metrics.ts"
    - "packages/db/src/schema/raw-pulls.ts"
    - "packages/db/src/schema/ingestion-coverage.ts"
    - "packages/db/src/db.ts"
    - "packages/db/src/index.ts"

key-decisions:
  - "Migration file keeps drizzle-kit generated name (0000_aberrant_namora.sql) — renaming would break _journal.json and corrupt migration state tracking"
  - "FORCE ROW LEVEL SECURITY appended to init migration (not separate file) — logically part of table creation, ensures it runs atomically with ENABLE ROW LEVEL SECURITY"
  - "Continuous aggregate deferred — references modeled_* columns that will be NULL until Phase 3 statistical engine runs"
  - "Bare imports (no .js extension) in schema files — drizzle-kit bundler requires TypeScript resolution, .js extensions fail module lookup against .ts source files"

patterns-established:
  - "drizzle-kit generate: always run with DATABASE_URL env var (can be a placeholder value) — config requires dbCredentials"
  - "Custom migrations: use drizzle-kit generate --custom to register in journal; populate SQL manually"
  - "Migration runner: tsx src/migrate.ts with non-pooling connection; run as pnpm db:migrate"

requirements-completed: [ARCH-01, ARCH-02, ARCH-03]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 1 Plan 02: Data Architecture Summary

**Drizzle-generated SQL migrations with full RLS enforcement (ENABLE + FORCE), TimescaleDB hypertable conversions for campaign_metrics and raw_api_pulls, and a tsx-based migration runner script**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T04:20:14Z
- **Completed:** 2026-02-24T04:23:36Z
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified in src; 4 migration files created)

## Accomplishments

- Two migration files ready to deploy: init migration with all 8 tables + 7 FORCE ROW LEVEL SECURITY statements, custom hypertable migration with TimescaleDB extension + compression policy
- campaign_metrics configured as hypertable with 1-month time chunks and 90-day compression policy segmented by tenant_id + campaign_id
- raw_api_pulls configured as hypertable with 1-week time chunks (higher volume, shorter retention than metrics)
- Migration runner (migrate.ts) using non-pooling single-connection pattern, executable via `pnpm db:migrate`

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate Drizzle migrations with RLS and TimescaleDB hypertables** - `1b37255` (feat)
2. **Task 2: Create migration runner script and db:migrate package script** - `970abef` (feat)

## Files Created/Modified

- `packages/db/migrations/0000_aberrant_namora.sql` - Drizzle-generated init migration: all 8 CREATE TABLE, ENABLE RLS on 7 tables, 7 restrictive RLS policies, FORCE RLS on 7 tables, unique index on campaign_metrics, FK constraints
- `packages/db/migrations/0001_hypertables.sql` - Custom migration: TimescaleDB extension, create_hypertable for campaign_metrics (1 month) and raw_api_pulls (1 week), compression policy for campaign_metrics
- `packages/db/migrations/meta/_journal.json` - Drizzle migration journal tracking both migrations
- `packages/db/src/migrate.ts` - Migration runner: non-pooling postgres connection (max: 1), drizzle-orm/postgres-js/migrator, exits with code 1 on failure
- `packages/db/package.json` - Added tsx devDependency, added db:migrate script
- `packages/db/src/schema/index.ts` - Fixed .js imports to bare imports for drizzle-kit compatibility
- `packages/db/src/schema/campaigns.ts` - Fixed .js imports to bare imports
- `packages/db/src/schema/creatives.ts` - Fixed .js imports to bare imports
- `packages/db/src/schema/metrics.ts` - Fixed .js imports to bare imports
- `packages/db/src/schema/raw-pulls.ts` - Fixed .js imports to bare imports
- `packages/db/src/schema/ingestion-coverage.ts` - Fixed .js imports to bare imports
- `packages/db/src/db.ts` - Fixed .js imports to bare imports
- `packages/db/src/index.ts` - Fixed .js imports to bare imports

## Decisions Made

- **Migration file name preserved**: drizzle-kit generates names like `0000_aberrant_namora.sql` with a random suffix recorded in `meta/_journal.json`. Renaming would desync the journal and corrupt migration state tracking. The file serves as the canonical init migration regardless of name.
- **FORCE ROW LEVEL SECURITY in init migration**: Appended directly to the Drizzle-generated file rather than a separate file, ensuring table owner bypass prevention is established atomically with table creation. Drizzle-kit's diff engine does not manage FORCE RLS, so manual append is the correct pattern.
- **Continuous aggregate deferred**: The RESEARCH.md template included a continuous aggregate over modeled columns — but those columns will be NULL until Phase 3. Adding the aggregate now would reference columns with no data, producing misleading results. Deferred to Phase 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed .js extensions from schema imports for drizzle-kit compatibility**
- **Found during:** Task 1 (running drizzle-kit generate)
- **Issue:** drizzle-kit's internal CJS bundler resolves imports using Node.js require(), which cannot find `.ts` source files when imports use `.js` extensions. Error: `Cannot find module './tenants.js'`
- **Fix:** Updated all intra-package imports in `src/schema/index.ts`, `src/db.ts`, `src/index.ts`, and all schema files from `'./roles.js'` to `'./roles'` (bare imports). TypeScript compilation still passes with tsconfig `moduleResolution: "bundler"`.
- **Files modified:** packages/db/src/schema/index.ts, packages/db/src/schema/campaigns.ts, packages/db/src/schema/creatives.ts, packages/db/src/schema/metrics.ts, packages/db/src/schema/raw-pulls.ts, packages/db/src/schema/ingestion-coverage.ts, packages/db/src/db.ts, packages/db/src/index.ts
- **Verification:** drizzle-kit generate ran successfully, producing 8 tables
- **Committed in:** 1b37255 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for drizzle-kit to load the schema. Bare imports are functionally identical for the TypeScript compiler with moduleResolution: bundler. No scope creep.

## Issues Encountered

- drizzle-kit requires a DATABASE_URL in the config even for local schema-only generation. Used a placeholder URL (`postgresql://placeholder:placeholder@localhost:5432/placeholder`) — generation does not connect to the database, so any syntactically valid URL works.

## User Setup Required

None - no external service configuration required. Migration runner reads DATABASE_URL from environment variables set during infrastructure provisioning. The `app_user` PostgreSQL role must be created before running migrations (documented in packages/db/src/schema/roles.ts).

## Next Phase Readiness

- All migration files are ready to run against a PostgreSQL + TimescaleDB database with `pnpm db:migrate`
- The `app_user` PostgreSQL role must be created by DBA/infra before migrations run (see STATE.md blockers)
- TimescaleDB must be installed in the target database (Railway custom Docker image required — see STATE.md blockers)
- Phase 2 ingestion pipeline can now reference the migration output for table structures and RLS patterns

---
*Phase: 01-data-architecture*
*Completed: 2026-02-24*

## Self-Check: PASSED

All 4 expected files exist on disk. Both task commits verified in git log (1b37255, 970abef). TypeScript compiles with zero errors.
