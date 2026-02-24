---
phase: 01-data-architecture
plan: 01
subsystem: database
tags: [drizzle-orm, postgres, rls, postgresql, timescaledb, multi-tenant, schema]

# Dependency graph
requires: []
provides:
  - "packages/db TypeScript package with drizzle-orm schema definitions"
  - "8 PostgreSQL tables: tenants, campaigns, adSets, ads, creatives, campaignMetrics, rawApiPulls, ingestionCoverage"
  - "Restrictive RLS policies on all 7 tenant-data tables using current_setting('app.current_tenant_id')::uuid"
  - "withTenant helper wrapping queries in transactions with SET LOCAL tenant context"
  - "Dual attribution columns in campaignMetrics (direct_* and modeled_*) for ARCH-02"
  - "Creative metadata table with format, headline, primaryText, imageUrl, videoUrl for ARCH-01"
  - "ingestionCoverage table for data completeness tracking and 1-year analysis gate (ARCH-03)"
  - "drizzle.config.ts with entities.roles=true for pgRole management"
affects:
  - "02-data-architecture: ingestion pipeline writes to rawApiPulls and campaignMetrics"
  - "03-statistics-engine: reads campaignMetrics, writes modeled_* columns"
  - "04-dashboard: reads campaignMetrics with both direct and modeled attribution"
  - "05-reporting: reads all tables via withTenant context"
  - "06-auth: connects to tenants table, wires up app_user role"

# Tech tracking
tech-stack:
  added:
    - "drizzle-orm 0.45.1 — TypeScript schema definitions and query builder with pgPolicy support"
    - "drizzle-kit 0.31.9 — migration generation and execution"
    - "postgres 3.4.8 — PostgreSQL driver (postgres.js)"
    - "@types/node 25.3.0 — Node.js type definitions"
  patterns:
    - "Restrictive RLS using pgPolicy with current_setting('app.current_tenant_id')::uuid on all tenant tables"
    - "withTenant<T> transaction wrapper using SET LOCAL for per-request tenant isolation"
    - "Dual attribution row pattern: direct_* (ingestion) + modeled_* (Phase 3 engine) in same row"
    - "TimescaleDB hypertable preparation: NOT NULL time column, unique index for upsert semantics"
    - "appRole = pgRole('app_user').existing() shared across all RLS policy definitions"

key-files:
  created:
    - "packages/db/package.json"
    - "packages/db/tsconfig.json"
    - "packages/db/drizzle.config.ts"
    - "packages/db/src/db.ts"
    - "packages/db/src/index.ts"
    - "packages/db/src/schema/roles.ts"
    - "packages/db/src/schema/index.ts"
    - "packages/db/src/schema/tenants.ts"
    - "packages/db/src/schema/campaigns.ts"
    - "packages/db/src/schema/creatives.ts"
    - "packages/db/src/schema/metrics.ts"
    - "packages/db/src/schema/raw-pulls.ts"
    - "packages/db/src/schema/ingestion-coverage.ts"
  modified: []

key-decisions:
  - "No UUID primary key on campaignMetrics — TimescaleDB hypertable pattern uses uniqueIndex on (tenantId, campaignId, date, source) as dedup constraint"
  - "tenants table has NO RLS — it is the root of the isolation hierarchy; access controlled by application auth"
  - "appRole declared as .existing() — role created outside Drizzle by infra/DBA, not managed by drizzle-kit migrations"
  - "schema/index.ts uses .js extensions for ESM compatibility with moduleResolution bundler"

patterns-established:
  - "RLS pattern: every tenant-data table gets pgPolicy('tenant_isolation', { as: 'restrictive', for: 'all', to: appRole, using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid` })"
  - "Tenant context: all data access wraps queries in withTenant(tenantId, (tx) => ...) — never query without tenant scope"
  - "Migrations: always use drizzle-kit migrate (never push) where RLS policies exist"

requirements-completed: [ARCH-01, ARCH-02, ARCH-03]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 1 Plan 01: Data Architecture Summary

**Drizzle ORM packages/db package with 8-table PostgreSQL schema, restrictive RLS on all tenant tables, dual attribution columns (ARCH-02), creative metadata (ARCH-01), and ingestion coverage tracking (ARCH-03)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T04:13:29Z
- **Completed:** 2026-02-24T04:17:30Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Full packages/db package with drizzle-orm 0.45.1, postgres 3.4.8, drizzle-kit 0.31.9 installed and TypeScript compiling with zero errors
- 8 PostgreSQL tables defined: tenants (no RLS), campaigns, adSets, ads, creatives, campaignMetrics, rawApiPulls, ingestionCoverage (all with restrictive RLS)
- Dual attribution pattern: campaignMetrics stores both direct_* (ingestion pipeline) and modeled_* (Phase 3 engine, nullable) columns side-by-side, avoiding joins at query time
- Creative metadata table (ARCH-01) with all format/copy/asset fields ready for Phase 2 ingestion
- withTenant helper using SET LOCAL transaction context — tenant isolation enforced at database layer, not application layer

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold packages/db with dependencies, config, and connection helper** - `8e6a482` (feat)
2. **Task 2: Create all schema tables with RLS policies and dual attribution** - `88f872f` (feat)
3. **Chore: .gitignore and pnpm lockfile** - `925f8e8` (chore)

## Files Created/Modified

- `packages/db/package.json` - @incremental-iq/db package with drizzle-orm, postgres, drizzle-kit dependencies
- `packages/db/tsconfig.json` - ES2022, ESNext module, bundler resolution, strict TypeScript
- `packages/db/drizzle.config.ts` - Drizzle Kit config with entities.roles=true for pgRole management
- `packages/db/src/db.ts` - Drizzle db instance + withTenant<T> helper using SET LOCAL transaction context
- `packages/db/src/index.ts` - Package entry point
- `packages/db/src/schema/roles.ts` - appRole = pgRole('app_user').existing()
- `packages/db/src/schema/index.ts` - Re-exports all schema modules
- `packages/db/src/schema/tenants.ts` - Organizations table with analysisUnlocked gate (ARCH-03), no RLS
- `packages/db/src/schema/campaigns.ts` - Campaign hierarchy (campaigns, adSets, ads) with RLS; ads.creativeId FK (ARCH-01)
- `packages/db/src/schema/creatives.ts` - Creative metadata (ARCH-01) with all format/copy/asset fields + RLS
- `packages/db/src/schema/metrics.ts` - campaignMetrics with direct_*/modeled_* dual attribution (ARCH-02), unique index + RLS
- `packages/db/src/schema/raw-pulls.ts` - Immutable raw API landing zone with attributionWindow field + RLS
- `packages/db/src/schema/ingestion-coverage.ts` - Data completeness tracking per tenant/source/date (ARCH-03) + RLS

## Decisions Made

- **No UUID primary key on campaignMetrics**: TimescaleDB hypertable documentation recommends against UUID PKs that conflict with the time dimension. Using `uniqueIndex('campaign_metrics_unique')` on `(tenantId, campaignId, date, source)` as the deduplication constraint (Pitfall 5 from RESEARCH.md).
- **tenants table has no RLS**: It is the root of the isolation hierarchy. Application-level auth controls access to this table; adding RLS would create a chicken-and-egg problem with tenant context bootstrapping.
- **appRole as .existing()**: The `app_user` PostgreSQL role is created by infrastructure/DBA scripts, not by Drizzle migrations. This prevents the migration from failing if the role already exists.
- **ESM .js extensions in imports**: With `moduleResolution: "bundler"` and `"type": "module"` in package.json, TypeScript requires `.js` extensions in import paths at runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @types/node for process.env TypeScript support**
- **Found during:** Task 1 (TypeScript compilation verification)
- **Issue:** `src/db.ts` uses `process.env.DATABASE_URL` but TypeScript reported `Cannot find name 'process'` without Node.js type definitions
- **Fix:** `pnpm add -D @types/node` and added `"types": ["node"]` to tsconfig.json
- **Files modified:** packages/db/package.json, packages/db/tsconfig.json
- **Verification:** `npx tsc --noEmit --skipLibCheck` passes with no errors
- **Committed in:** 8e6a482 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for TypeScript compilation. Standard Node.js types fix — no scope creep.

## Issues Encountered

None — all patterns from RESEARCH.md implemented exactly as specified.

## User Setup Required

None - no external service configuration required. Database connection is via `DATABASE_URL` environment variable, set during infrastructure provisioning.

## Next Phase Readiness

- All schema tables are defined and TypeScript-validated, ready for migration generation via `drizzle-kit generate`
- The `withTenant` helper is ready for use by all subsequent phases that query tenant data
- TimescaleDB hypertable conversion (campaignMetrics, rawApiPulls) requires a custom migration in the next plan step
- The `app_user` PostgreSQL role must be created in the database before running migrations (documented in schema/roles.ts)
- RLS will not be enforced for the table owner — `ALTER TABLE ... FORCE ROW LEVEL SECURITY` should be added to the custom migration as a safety net (RESEARCH.md Pitfall 1)

---
*Phase: 01-data-architecture*
*Completed: 2026-02-24*

## Self-Check: PASSED

All 12 expected files exist on disk. All 3 task commits verified in git log (8e6a482, 88f872f, 925f8e8). TypeScript compiles with zero errors.
