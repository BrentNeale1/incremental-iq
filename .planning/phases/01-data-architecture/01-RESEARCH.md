# Phase 1: Data Architecture - Research

**Researched:** 2026-02-24
**Domain:** PostgreSQL schema design, Row Level Security, TimescaleDB hypertables, Drizzle ORM, multi-tenant isolation
**Confidence:** HIGH (core RLS and PostgreSQL patterns) / MEDIUM (Drizzle + TimescaleDB integration specifics)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Data schema supports creative-level metadata for future v2 analysis | Schema includes `creatives` table with metadata fields (format, headline, copy, image_url, video_url, creative_id_external) joined to `ads`. No UI or analysis logic — structure only. Established pattern: include columns, defer indexes for unused fields until v2. |
| ARCH-02 | Dual attribution layers: direct (trackable) and modeled (estimated) shown side by side | Single record stores both `direct_*` and `modeled_*` columns per metric (revenue, conversions, roas). Avoids joins at query time. Pattern verified: wide row with nullable modeled columns populated by the statistics engine in Phase 3. |
| ARCH-03 | System enforces minimum 1 year historical data before first analysis, recommends 3 years | Schema tracks `data_completeness` per tenant/source/date combination. Application gate enforces analysis lock until sufficient coverage exists. Schema needs: `ingestion_coverage` table or completeness flag on `raw_api_pulls`. |

</phase_requirements>

---

## Summary

Phase 1 establishes the data schema that every subsequent phase writes into. The primary work is designing PostgreSQL tables with Row Level Security (RLS), converting time-series fact tables to TimescaleDB hypertables, and defining the normalized campaign/metric structure that supports dual attribution layers and creative metadata.

The central architectural decision for this phase is enforcing tenant isolation at the database layer — not the application layer. PostgreSQL RLS policies using `current_setting('app.current_tenant_id')` provide defense-in-depth: even if application code has a WHERE clause bug, the database will not expose another tenant's rows. This must be designed from schema creation; retrofitting RLS onto populated tables is operationally painful.

The integration between Drizzle ORM and TimescaleDB has a critical gap: Drizzle has no native support for `create_hypertable`. The workaround is a custom SQL migration file generated with `drizzle-kit generate --custom`, which contains the `SELECT create_hypertable(...)` call. This is a deliberate split: Drizzle manages the table structure (columns, indexes, policies), and a separate custom migration handles the hypertable conversion. This is the community-standard approach as of 2025 — no native support is yet available despite an open feature request.

**Primary recommendation:** Use Drizzle ORM with `pgPolicy` for declarative RLS policies in the schema definition, and use `drizzle-kit generate --custom` to create the hypertable migration as a separate step. Run `drizzle-kit migrate` (not `push`) in all environments where RLS policies exist.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | Schema definition, query builder, RLS policy declarations | TypeScript-native, transparent SQL, raw SQL escape hatches for TimescaleDB functions, `pgPolicy` built-in as of recent versions |
| drizzle-kit | 0.31.9 | Migration generation and execution | Paired with drizzle-orm; `--custom` flag enables custom SQL migrations for TimescaleDB |
| postgres | 3.4.8 | PostgreSQL driver (postgres.js) | Fast, low-overhead, native `SET LOCAL` support for per-transaction tenant context |
| PostgreSQL | 16.x | Primary relational store | Native RLS, JSONB, mature ecosystem, TimescaleDB extension support |
| TimescaleDB | 2.17+ | Time-series extension for PostgreSQL | Hypertables for automatic time partitioning; continuous aggregates for pre-computed rollups; compression for multi-year historical data |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Runtime schema validation | Validate all data entering the schema boundary (API inputs, ingestion payloads) |
| typescript | 5.9.3 | Full-stack type safety | Shared types between the schema definition and API layer |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| drizzle-orm 0.45.1 | drizzle-orm v1.0.0-beta.2 | v1 beta is unstable by team's own admission ("something will definitely break") — use current stable 0.x |
| TimescaleDB | Plain PostgreSQL partitioning | `PARTITION BY RANGE` on date works but requires manual partition management; no continuous aggregates; no compression policy API; TimescaleDB is the correct choice at this scale |
| TimescaleDB | ClickHouse | Separate service, separate query language, bidirectional sync complexity; ClickHouse is appropriate at 100M+ rows/day — not needed at MVP |
| postgres.js | pg / node-postgres | postgres.js is faster, better TypeScript types, tagged template literals; pg is more battle-tested but slower for this use case |

**Installation:**

```bash
# In packages/db (monorepo shared DB package)
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# Workspace root or apps/web
pnpm add zod
```

---

## Architecture Patterns

### Recommended Project Structure

```
packages/db/
├── src/
│   ├── schema/
│   │   ├── tenants.ts          # organizations / accounts table
│   │   ├── campaigns.ts        # campaign hierarchy (campaign → ad_set → ad)
│   │   ├── creatives.ts        # creative metadata (ARCH-01)
│   │   ├── metrics.ts          # daily metric facts with dual attribution (ARCH-02)
│   │   ├── raw-pulls.ts        # immutable raw API landing zone
│   │   ├── ingestion-coverage.ts  # data completeness tracking (ARCH-03)
│   │   └── index.ts            # re-exports all schema
│   ├── migrations/
│   │   ├── 0000_init.sql       # generated by drizzle-kit
│   │   ├── 0001_hypertables.sql  # custom: SELECT create_hypertable(...)
│   │   └── meta/               # drizzle-kit migration metadata
│   ├── db.ts                   # database connection + tenant context helper
│   └── migrate.ts              # migration runner script
├── drizzle.config.ts
└── package.json
```

### Pattern 1: Declarative RLS in Drizzle Schema

**What:** Define RLS policies directly in the Drizzle `pgTable` call using `pgPolicy`. The policies reference `current_setting('app.current_tenant_id')` so the database enforces isolation — not application code.

**When to use:** Every table that stores tenant data. No exceptions.

**Critical caveats verified from official Drizzle docs:**
- Use `drizzle-kit migrate` (NOT `drizzle-kit push`) in any environment where RLS policies exist — push does not handle policy diffs correctly
- Enable `entities: { roles: true }` in `drizzle.config.ts` if managing PostgreSQL roles through Drizzle
- If the DB user is also the table owner, run `ALTER TABLE ... FORCE ROW LEVEL SECURITY` — owners bypass RLS by default unless forced
- RLS is automatically enabled when you add `pgPolicy` to a table — no separate `ALTER TABLE ENABLE ROW LEVEL SECURITY` needed when using Drizzle's declarative approach

```typescript
// Source: https://orm.drizzle.team/docs/rls
import { sql } from 'drizzle-orm';
import { pgPolicy, pgRole, pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

// Define the application role (not the DB owner role)
export const appRole = pgRole('app_user').existing();

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  source: text('source').notNull(),  // 'google_ads' | 'meta' | etc
  externalId: text('external_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',        // restrictive = AND-combined; harder to bypass
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
```

**Setting tenant context before queries:**

```typescript
// Source: https://orm.drizzle.team/docs/rls + community patterns
// In db.ts — wraps all queries in a transaction with tenant context
import { db } from './db';
import { sql } from 'drizzle-orm';

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL scopes the config to this transaction only
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
    return fn(tx);
  });
}

// Usage in every data-access operation:
const campaigns = await withTenant(tenantId, (tx) =>
  tx.select().from(schema.campaigns)
);
```

### Pattern 2: TimescaleDB Hypertable via Custom Migration

**What:** Drizzle defines the table structure (columns, indexes, RLS policies). A separate custom migration converts it to a hypertable. This is the required workaround — Drizzle has no native `create_hypertable` support (GitHub issue #2962 open as of 2025).

**When to use:** The `campaign_metrics` table (daily fact table) and `raw_api_pulls` table.

**Step 1 — Drizzle table definition (normal schema file):**

```typescript
// packages/db/src/schema/metrics.ts
import { pgTable, uuid, date, text, numeric, boolean } from 'drizzle-orm/pg-core';

export const campaignMetrics = pgTable('campaign_metrics', {
  // Time column MUST be NOT NULL for hypertables
  date: date('date').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),

  // Spend (always available from ad platforms)
  spendUsd: numeric('spend_usd', { precision: 12, scale: 4 }),

  // ARCH-02: Direct (trackable) attribution columns
  directRevenue: numeric('direct_revenue', { precision: 14, scale: 4 }),
  directConversions: numeric('direct_conversions', { precision: 10, scale: 2 }),
  directRoas: numeric('direct_roas', { precision: 8, scale: 4 }),

  // ARCH-02: Modeled (estimated) attribution columns — populated by Phase 3 engine
  modeledRevenue: numeric('modeled_revenue', { precision: 14, scale: 4 }),
  modeledConversions: numeric('modeled_conversions', { precision: 10, scale: 2 }),
  modeledRoas: numeric('modeled_roas', { precision: 8, scale: 4 }),
  modeledIncrementalLift: numeric('modeled_incremental_lift', { precision: 8, scale: 6 }),
  modeledLiftLower: numeric('modeled_lift_lower', { precision: 8, scale: 6 }),
  modeledLiftUpper: numeric('modeled_lift_upper', { precision: 8, scale: 6 }),
  modeledConfidence: numeric('modeled_confidence', { precision: 5, scale: 4 }),
  modeledAt: timestamp('modeled_at', { withTimezone: true }),

  // Impression/click data
  impressions: numeric('impressions', { precision: 14, scale: 0 }),
  clicks: numeric('clicks', { precision: 12, scale: 0 }),
  ctr: numeric('ctr', { precision: 8, scale: 6 }),
  cpm: numeric('cpm', { precision: 10, scale: 4 }),
});
```

**Step 2 — Custom migration for hypertable conversion:**

```bash
# Generate empty custom migration file
drizzle-kit generate --custom --name=convert_metrics_to_hypertable
```

```sql
-- packages/db/migrations/XXXXXX_convert_metrics_to_hypertable.sql
-- TimescaleDB extension must be enabled first
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert campaign_metrics to hypertable
-- chunk_time_interval = 1 month: campaign data is weekly/monthly in cadence
-- At MVP scale (~1-10K rows/day), 1 month chunks are well-sized
SELECT create_hypertable(
  'campaign_metrics',
  'date',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- Compression: compress chunks older than 90 days
ALTER TABLE campaign_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id, campaign_id',
  timescaledb.compress_orderby = 'date DESC'
);
SELECT add_compression_policy('campaign_metrics', INTERVAL '90 days');

-- Continuous aggregate: weekly rollup per campaign (used by dashboard)
CREATE MATERIALIZED VIEW campaign_metrics_weekly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 week', date::timestamptz) AS week,
  tenant_id,
  campaign_id,
  sum(spend_usd) AS total_spend,
  sum(direct_revenue) AS total_direct_revenue,
  sum(modeled_revenue) AS total_modeled_revenue,
  avg(modeled_incremental_lift) AS avg_lift,
  avg(modeled_confidence) AS avg_confidence
FROM campaign_metrics
GROUP BY week, tenant_id, campaign_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('campaign_metrics_weekly',
  start_offset => INTERVAL '2 weeks',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day');

-- Same for raw_api_pulls (append-only, benefits from time partitioning)
SELECT create_hypertable(
  'raw_api_pulls',
  'pulled_at',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE
);
```

### Pattern 3: Dual Attribution Columns (ARCH-02)

**What:** Both direct and modeled attribution values live in the same row. The `direct_*` columns are populated by the ingestion pipeline (Phase 2) from Shopify/CRM ground truth. The `modeled_*` columns are populated by the statistical engine (Phase 3) and are NULL until that engine runs.

**Why side-by-side in one row:** Avoids joins at dashboard query time. Queries like "show direct vs. modeled ROAS for all campaigns this month" are a single table scan, not a join between two tables.

**NULL semantics:**
- `direct_revenue IS NOT NULL` = trackable attribution available
- `modeled_revenue IS NULL` = statistical engine hasn't run yet (or data insufficient)
- `modeled_revenue IS NOT NULL AND modeled_confidence < 0.5` = low-confidence estimate, show warning

```typescript
// Dashboard query pattern — no joins needed
const results = await withTenant(tenantId, (tx) =>
  tx
    .select({
      date: campaignMetrics.date,
      campaignId: campaignMetrics.campaignId,
      spendUsd: campaignMetrics.spendUsd,
      directRevenue: campaignMetrics.directRevenue,
      modeledRevenue: campaignMetrics.modeledRevenue,
      modeledConfidence: campaignMetrics.modeledConfidence,
    })
    .from(campaignMetrics)
    .where(
      and(
        gte(campaignMetrics.date, startDate),
        lte(campaignMetrics.date, endDate)
      )
    )
    .orderBy(desc(campaignMetrics.date))
);
```

### Pattern 4: Creative Metadata Tables (ARCH-01)

**What:** A `creatives` table stores metadata fields for ad creative assets. `ads` references `creatives` via foreign key. No UI or analysis logic in v1 — the schema is ready, the fields exist, and Phase 2 will populate them when ad data is ingested.

**Why columns now, not a migration later:** Adding nullable columns to a table with millions of rows in production requires a table rewrite or careful `ADD COLUMN ... DEFAULT NULL` (which PostgreSQL handles efficiently). Designing for the columns now prevents schema drift between code and db in v2.

```typescript
// packages/db/src/schema/creatives.ts
export const creatives = pgTable('creatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  externalId: text('external_id').notNull(),   // Platform's creative ID
  source: text('source').notNull(),             // 'meta' | 'google_ads' | etc
  name: text('name'),
  format: text('format'),                       // 'image' | 'video' | 'carousel' | 'text'
  headline: text('headline'),
  primaryText: text('primary_text'),            // ad copy / body
  description: text('description'),
  callToAction: text('call_to_action'),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  aspectRatio: text('aspect_ratio'),            // '1:1' | '9:16' | '4:5' | etc
  durationSeconds: numeric('duration_seconds', { precision: 6, scale: 1 }),
  externalMetadata: jsonb('external_metadata'), // Raw platform creative metadata
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);

// ads.ts — creative_id foreign key
export const ads = pgTable('ads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  adSetId: uuid('ad_set_id').references(() => adSets.id),
  creativeId: uuid('creative_id').references(() => creatives.id),  // ARCH-01
  externalId: text('external_id').notNull(),
  name: text('name'),
  status: text('status'),
  // ...
});
```

### Pattern 5: Data Completeness Tracking (ARCH-03)

**What:** A dedicated table tracks whether data for each tenant/source/date combination was successfully ingested. The application checks this table to enforce the "1 year minimum" gate before allowing analysis to run.

**Why a table, not application memory:** The analysis gate must survive server restarts, deploys, and multi-instance deployments. Storing coverage state in the database is the only reliable approach.

```typescript
// packages/db/src/schema/ingestion-coverage.ts
export const ingestionCoverage = pgTable('ingestion_coverage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  source: text('source').notNull(),           // 'meta' | 'google_ads' | 'shopify' | etc
  coverageDate: date('coverage_date').notNull(),
  status: text('status').notNull(),           // 'complete' | 'partial' | 'failed' | 'pending'
  recordCount: numeric('record_count', { precision: 12, scale: 0 }),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  notes: text('notes'),                       // error messages, partial reasons
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);

// Query to check if tenant meets 1-year minimum:
// SELECT COUNT(DISTINCT coverage_date) FROM ingestion_coverage
// WHERE tenant_id = $tenantId
//   AND source IN ('shopify', 'google_ads', 'meta')  -- must have revenue + at least one ad source
//   AND status = 'complete'
//   AND coverage_date >= NOW() - INTERVAL '1 year'
// HAVING COUNT(DISTINCT coverage_date) >= 365
```

### Pattern 6: Raw API Landing Zone (Immutable)

**What:** All raw API responses are stored verbatim before any transformation. The `normalized` flag tracks whether the normalization pipeline has processed each record. Normalization never modifies raw records.

```typescript
// packages/db/src/schema/raw-pulls.ts
export const rawApiPulls = pgTable('raw_api_pulls', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  source: text('source').notNull(),
  pulledAt: timestamp('pulled_at', { withTimezone: true }).defaultNow().notNull(),
  apiVersion: text('api_version'),             // e.g. 'v21.0' for Meta
  attributionWindow: text('attribution_window'), // e.g. '7d_click_1d_view' — PITFALL-15
  apiParams: jsonb('api_params').notNull(),    // what query was issued
  payload: jsonb('payload').notNull(),         // raw API response, unmodified
  normalized: boolean('normalized').default(false).notNull(),
  normalizedAt: timestamp('normalized_at', { withTimezone: true }),
  schemaVersion: text('schema_version'),       // track normalization schema version applied
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
```

### Anti-Patterns to Avoid

- **Application-only tenant filtering:** Never rely solely on WHERE clauses in application code. One missed WHERE is a data breach. RLS is the enforcement layer; application filters are defense-in-depth only.
- **drizzle-kit push with RLS:** Always use `drizzle-kit migrate`. The push command does not properly diff RLS policy changes and will silently fail to apply or drop policies.
- **Table owner bypassing RLS:** The database user used by the application must NOT be the table owner unless `FORCE ROW LEVEL SECURITY` is set. Test this explicitly — owner bypass is a silent misconfiguration.
- **Hypertable on non-timestamptz columns:** TimescaleDB requires the time column to be `NOT NULL`. Using a nullable date or omitting the `NOT NULL` constraint will cause `create_hypertable` to fail with an unclear error.
- **Normalization in the connector layer:** Connectors write to `raw_api_pulls` only. Transformation to `campaign_metrics` is a separate normalization step. Combining them makes re-normalization require API re-fetching.
- **Modeled values in a separate table:** Keeping direct and modeled attribution in the same row (not separate tables or a EAV structure) is required for dashboard query performance and operational simplicity.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Row-level tenant isolation | Custom WHERE clause middleware | PostgreSQL RLS policies | Database enforces at query execution; cannot be bypassed by ORM bugs; defense-in-depth standard |
| Time-series partitioning | Manual date-range partition tables | TimescaleDB hypertables | Auto-manages chunk lifecycle, compression, continuous aggregates; eliminates months of partition management code |
| Schema migration tracking | Custom migration table | drizzle-kit migrations | Race conditions, rollback, team coordination; drizzle-kit handles all of this reliably |
| Tenant context passing | Thread-local globals or request injection | PostgreSQL `SET LOCAL` in transactions | `SET LOCAL` scopes the tenant to the transaction; cannot leak across requests; standard PostgreSQL pattern |

**Key insight:** Multi-tenant isolation done in application code has an exponentially growing attack surface as the codebase grows. Every new ORM query is a potential isolation bug. PostgreSQL RLS moves this enforcement to the database where it cannot be bypassed — the enforcement point stays constant regardless of application complexity.

---

## Common Pitfalls

### Pitfall 1: DB Owner Bypasses RLS Silently

**What goes wrong:** The PostgreSQL role used by the application is also the owner of the tables (common in development setups where migrations are run as the app user). Table owners bypass RLS by default. The application appears to have tenant isolation but every query actually returns all tenant rows.

**Why it happens:** PostgreSQL's RLS documentation notes that owners bypass security unless `FORCE ROW LEVEL SECURITY` is applied. Most development setups use a single superuser for everything.

**How to avoid:**
1. In production: Create a dedicated `app_user` role that is NOT the table owner. Migrations run as a separate `migrations_user`. Application connects as `app_user`.
2. In development (simplicity over rigor): Add `ALTER TABLE <each_table> FORCE ROW LEVEL SECURITY` to the custom migration, which forces RLS even for owners.
3. Explicitly test: After migration, connect as the application user and assert that `SELECT * FROM campaigns` with `SET app.current_tenant_id = 'tenant-a'` does not return tenant-b rows.

**Warning signs:** Integration tests that query across all tenants succeeding when they should fail; `COUNT(*)` matching total row count rather than tenant-scoped count.

**Source confidence:** HIGH — documented behavior in official PostgreSQL docs.

### Pitfall 2: drizzle-kit push Silently Ignores Policy Changes

**What goes wrong:** A developer adds a new RLS policy to a Drizzle schema, runs `drizzle-kit push` (common in development), and sees no errors. The policy was never applied to the database. All subsequent data access is unprotected.

**Why it happens:** `drizzle-kit push` (the fast schema-sync command for development) has known issues with RLS policy diffing. It does not reliably detect policy additions, modifications, or deletions.

**How to avoid:** Always use `drizzle-kit generate` + `drizzle-kit migrate` — even in development for any environment where RLS is expected to be enforced. Add a CI check that verifies policy existence after migration.

**Warning signs:** `drizzle-kit push` completes without applying expected `pgPolicy` changes; no `pg_policies` entries in the database after schema update.

**Source confidence:** HIGH — documented in Drizzle ORM official docs and GitHub discussions.

### Pitfall 3: Attribution Window Not Stored With Raw Data

**What goes wrong:** Meta changes their default attribution window from 28-day click to 7-day click (this happened historically). Raw data stored before and after the change cannot be compared because the window definition differs. The incrementality model runs a year-over-year comparison with incompatible data and produces incorrect baselines.

**Why it happens:** Most ingestion pipelines store metric values but not the metadata describing how those metrics were measured.

**How to avoid:** The `raw_api_pulls` table includes `attribution_window` as a column. Every ingestion job records the window configuration alongside the payload. The normalization layer must propagate this field through to `campaign_metrics`. If an attribution window change is detected (current window != stored window for same account), alert and trigger a backfill under the new window.

**Warning signs:** `attribution_window` field has high null rate; all historical records show the same window value regardless of API version.

**Source confidence:** HIGH — historical Meta attribution window change is documented fact; pattern is directly relevant to ARCH-03.

### Pitfall 4: Hypertable on Wrong Column Type

**What goes wrong:** `create_hypertable` is called on `campaign_metrics` partitioning on `date` (PostgreSQL `DATE` type), but the column was defined as nullable. The call fails with a cryptic error. Alternatively, the time column works but produces suboptimal chunking because `DATE` doesn't include timezone info.

**How to avoid:**
- The time column for hypertables must be `NOT NULL`. Enforce this in the Drizzle schema definition.
- Use `TIMESTAMPTZ` (`timestamp with time zone`) for all time columns, including `date` on `campaign_metrics`. Even if the granularity is daily, `TIMESTAMPTZ` avoids timezone ambiguity in TimescaleDB range calculations.
- The custom migration should use `if_not_exists => TRUE` to be idempotent.

**Source confidence:** HIGH — TimescaleDB official docs specify NOT NULL requirement; TIMESTAMPTZ is the documented best practice.

### Pitfall 5: Missing Unique Constraint on campaign_metrics

**What goes wrong:** The ingestion pipeline runs multiple times for the same date range (retries, backfills). Without a unique constraint on `(tenant_id, campaign_id, date)`, the same day's metrics are inserted multiple times. The statistical engine sees inflated values and produces incorrect incrementality scores.

**How to avoid:** Add a unique constraint on `(tenant_id, campaign_id, date, source)`. Ingestion uses `INSERT ... ON CONFLICT DO UPDATE` (upsert) semantics.

```typescript
// In campaignMetrics table definition
}, (t) => [
  uniqueIndex('campaign_metrics_unique').on(
    t.tenantId, t.campaignId, t.date
  ),
  // ... pgPolicy
]);
```

**Source confidence:** MEDIUM — standard data warehouse pattern; verified against general ingestion best practices.

---

## Code Examples

Verified patterns from official sources and documented community practices:

### Complete Schema Module Entry Point

```typescript
// packages/db/src/schema/index.ts
export * from './tenants';
export * from './campaigns';
export * from './creatives';
export * from './metrics';
export * from './raw-pulls';
export * from './ingestion-coverage';

// Re-export the app role for use in policy definitions
export { appRole } from './roles';
```

### drizzle.config.ts with RLS Role Support

```typescript
// Source: https://orm.drizzle.team/docs/rls
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  entities: {
    roles: true,  // Required to manage pgRole definitions via drizzle-kit
  },
});
```

### Database Connection with Tenant Context Helper

```typescript
// packages/db/src/db.ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Use a non-pooling connection for migrations, pooling for app
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

/**
 * Wraps all queries in a transaction with tenant context set via SET LOCAL.
 * SET LOCAL scopes the config to this transaction — cannot leak to other requests.
 * RLS policies read current_setting('app.current_tenant_id') to enforce isolation.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: ReturnType<typeof db.transaction> extends Promise<infer U> ? U : never) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${tenantId}`);
    return fn(tx as any);
  });
}
```

### Tenants / Organizations Table

```typescript
// packages/db/src/schema/tenants.ts
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// The tenants table itself does NOT need RLS — it's the root of the isolation hierarchy.
// Access to the tenants table is controlled by application-level auth.
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('starter'),  // 'starter' | 'growth' | 'agency'
  analysisUnlocked: boolean('analysis_unlocked').default(false).notNull(),
  // Populated once 1yr coverage confirmed — enforces ARCH-03
  analysisUnlockedAt: timestamp('analysis_unlocked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### Migration Execution Script

```typescript
// packages/db/src/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Use non-pooling connection for migrations (single connection, sequential)
const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });

async function runMigrations() {
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: './migrations' });
  await migrationClient.end();
  console.log('Migrations complete');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.enableRLS()` on pgTable | `pgTable.withRLS()` or `pgPolicy` in table definition | Drizzle v1.0.0-beta.2 (Feb 2025) | `.enableRLS()` is now deprecated — use `pgTable.withRLS()` for RLS-only or `pgPolicy` for policy definitions |
| drizzle-orm 0.38.x | drizzle-orm 0.45.1 (stable), v1.0.0-beta.2 (unstable) | Dec 2024 - Feb 2025 | v1 beta is NOT production-ready per team; use 0.45.1 stable |
| TimescaleDB on Supabase | TimescaleDB self-hosted / Railway with custom Docker | Supabase deprecated TimescaleDB for Postgres 17 | Supabase managed TimescaleDB requires Pro + older Postgres; self-host or Railway is simpler |
| Next.js 15.x | Next.js 16.1.6 | Released 2025 | Verified via npm registry; latest stable is 16.x |

**Deprecated/outdated:**
- `enableRLS()` method: deprecated in favor of `pgTable.withRLS()` per Drizzle v1 beta docs — use `pgPolicy` for policies, `withRLS()` only to enable RLS on tables without policies
- TimescaleDB on Supabase: deprecated from Postgres 17 Supabase platform — self-hosted or Railway custom Docker required
- Drizzle v1.0.0-beta.2: explicitly marked as "something will definitely break" by the Drizzle team — team's recommended fallback is 0.44.7+

---

## Open Questions

1. **Primary key + date structure for campaign_metrics hypertable**
   - What we know: TimescaleDB requires the time column (`date`) to be the primary dimension; hypertables cannot have primary keys that don't include the time column in most configurations
   - What's unclear: Whether to use a composite primary key `(tenant_id, campaign_id, date)` or UUID primary key with a unique index — UUID primary key conflicts with TimescaleDB's recommended pattern
   - Recommendation: Use a unique index on `(tenant_id, campaign_id, date)` as the deduplication constraint. Omit a traditional UUID primary key on this hypertable. This is the documented TimescaleDB pattern.

2. **TimescaleDB chunk_time_interval for campaign_metrics at MVP scale**
   - What we know: At MVP scale (~1-100 accounts, ~1K-100K rows/day), 1 month is a reasonable default; TimescaleDB best practice is "25% of available RAM per active chunk"
   - What's unclear: Server memory at Railway is configurable but unknown until infrastructure is provisioned
   - Recommendation: Default to 1 month intervals. Adjust after first data ingestion when actual data volume is measurable.

3. **Separate DB user for migrations vs. app queries**
   - What we know: Table owner bypasses RLS by default; `FORCE ROW LEVEL SECURITY` is the development workaround; production best practice is separate roles
   - What's unclear: Railway's PostgreSQL service's flexibility for creating multiple database roles
   - Recommendation: Start with `FORCE ROW LEVEL SECURITY` in the custom migration as a safety net. Plan to split into `migrations_user` and `app_user` roles before first client data enters the system.

4. **TimescaleDB extension availability on Railway**
   - What we know: TimescaleDB requires a custom Docker image or a managed TimescaleDB service; Railway supports custom Docker images
   - What's unclear: Whether Railway's built-in PostgreSQL service has TimescaleDB available or if a custom image is required from day one
   - Recommendation: Plan for custom Docker image from the start. Verify Railway's TimescaleDB support before infrastructure provisioning. Fallback: use TimescaleDB Cloud (managed) and connect externally.

---

## Sources

### Primary (HIGH confidence)

- [Drizzle ORM - Row-Level Security (RLS)](https://orm.drizzle.team/docs/rls) — pgPolicy API, withRLS(), migration caveats, drizzle-kit push limitation
- [Drizzle ORM - Custom Migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — `drizzle-kit generate --custom` pattern for TimescaleDB
- [Drizzle ORM - v1.0.0-beta.2 release](https://orm.drizzle.team/docs/latest-releases/drizzle-orm-v1beta2) — confirmed v1 is beta, `.enableRLS()` deprecated
- npm registry (live verified 2026-02-24) — drizzle-orm: 0.45.1, drizzle-kit: 0.31.9, postgres: 3.4.8, bullmq: 5.70.1, next: 16.1.6, tailwindcss: 4.2.1, typescript: 5.9.3

### Secondary (MEDIUM confidence)

- [Permit.io - Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide) — current_setting pattern, defense-in-depth application integration
- [AWS Blog - Multi-tenant data isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) — SET LOCAL pattern, RLS policy structure
- [OneUptime - How to Design TimescaleDB Hypertables (Jan 2026)](https://oneuptime.com/blog/post/2026-01-26-timescaledb-hypertables/view) — create_hypertable SQL syntax, compression setup, continuous aggregates — VERIFIED code examples fetched directly
- [Drizzle ORM GitHub Issue #2962](https://github.com/drizzle-team/drizzle-orm/issues/2962) — confirmed no native TimescaleDB support; custom migration workaround is community standard
- [TimescaleDB GitHub Releases](https://github.com/timescale/timescaledb/releases) — v2.23.0 released Oct 2025, supports PostgreSQL 15-18
- [Neon Docs - Simplify RLS with Drizzle](https://neon.com/docs/guides/rls-drizzle) — SET LOCAL transaction pattern, AsyncLocalStorage tenant context management

### Tertiary (LOW confidence)

- WebSearch aggregated findings on TimescaleDB deprecation on Supabase Postgres 17 — requires direct verification against Railway TimescaleDB support before infrastructure decision

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm versions verified live; Drizzle RLS API verified from official docs
- Architecture (RLS patterns): HIGH — PostgreSQL RLS is stable, well-documented, industry-standard
- Architecture (TimescaleDB + Drizzle): MEDIUM — custom migration workaround is verified from GitHub issue and community patterns; no native Drizzle support confirmed
- Pitfalls: HIGH (RLS owner bypass, drizzle-kit push) / MEDIUM (attribution window, hypertable column type)

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (Drizzle is actively releasing; re-verify if v1 stable ships before planning completes)
