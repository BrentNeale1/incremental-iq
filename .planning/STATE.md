# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.
**Current focus:** Phase 2 - Core Data Ingestion (COMPLETE)

## Current Position

Phase: 2 of 6 (Core Data Ingestion) - COMPLETE
Plan: 6 of 6 in current phase - COMPLETE
Status: Phase 2 complete — all 6 plans executed. BullMQ scheduler, nightly sync, auto-backfill on OAuth connect, manual sync API (rate-limited), per-integration status, global freshness dashboard, ARCH-03 analysis gate.
Last activity: 2026-02-24 — Completed Plan 06: BullMQ scheduler (upsertJobScheduler 2am UTC), month-by-month backfill with live progress, auto-backfill triggered from all three OAuth callbacks, three API endpoints (manual sync, per-integration status, global freshness), ARCH-03 analysisUnlocked gate.

Progress: [████████░░] 78%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 6.2 min
- Total execution time: 0.62 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-architecture | 2 | 7 min | 3.5 min |
| 02-core-data-ingestion | 6 | 49 min | 8.2 min |

**Recent Trend:**
- Last 6 plans: 4 min, 3 min, 3 min, 8 min, 5 min, 9 min, 9 min
- Trend: stable

*Updated after each plan completion*

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 02-core-data-ingestion | P03 | 7 min | 2 tasks | 3 files |
| 02-core-data-ingestion | P05 | 9 min | 2 tasks | 3 files |
| 02-core-data-ingestion | P06 | 9 min | 3 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Statistical modeling as primary methodology (not holdout-first)
- Scaling-first recommendations over holdout-first
- CRM-first for lead gen (not GA4 as primary)
- Creative analysis: architecture only in v1, no UI
- Dual attribution layers: direct + modeled shown side by side
- 4 CRMs in v2 (HubSpot, Salesforce, GHL, Zoho deferred from v1)
- Auth deferred to Phase 6 — schema-first approach means data architecture is built before auth is wired in
- No UUID primary key on campaignMetrics — TimescaleDB hypertable uses uniqueIndex on (tenantId, campaignId, date, source)
- tenants table has NO RLS — root of isolation hierarchy, access controlled by application auth
- appRole declared as .existing() — created by infra/DBA, not managed by Drizzle migrations
- Migration file keeps drizzle-kit generated name (0000_aberrant_namora.sql) — renaming breaks _journal.json
- FORCE ROW LEVEL SECURITY appended to init migration (not separate file) — atomic with table creation
- Continuous aggregate deferred to Phase 3 — modeled_* columns NULL until statistical engine runs
- Bare imports (no .js extension) in schema files — drizzle-kit bundler requires TypeScript resolution
- packages/ingestion package type is 'module' with exports pointing to ./src/index.ts — matches packages/db pattern
- AES-256-GCM iv+authTag+ciphertext wire format — getKey() reads TOKEN_ENCRYPTION_KEY at call time so missing env var throws on use, not on import
- PlatformConnector defined as interface (not abstract class) — duck typing allows simpler mock implementations in tests
- NormalizedMetric numeric fields are string type — matches Drizzle numeric() column insert shape
- Drizzle migration named 0002_legal_puma.sql — drizzle-kit generated name kept (renaming breaks _journal.json, same Phase 1 pattern)
- FORCE ROW LEVEL SECURITY appended manually to 0002_legal_puma.sql — same atomic-with-table-creation pattern as 0000_aberrant_namora.sql
- Meta OAuth uses long-lived token exchange (60-day expiry) — avoids refresh token requirement
- Google OAuth stores both customerId and loginCustomerId in metadata — required for MCC accounts (RESEARCH.md Pitfall 5)
- Shopify offline tokens now expire in 1 hour (Dec 2025 change) — tokenExpiresAt stored as epoch ms in metadata; 5-minute refresh buffer; AbortError signals re-auth if refresh token >90 days old
- No backfill in OAuth HTTP handlers — Plan 06 scheduler responsibility (RESEARCH.md anti-pattern)
- HMAC-SHA256 state parameter with timing-safe comparison for OAuth CSRF protection
- serverExternalPackages: ['postgres'] in next.config.ts — prevents Next.js bundling postgres.js native modules
- [Phase 02-core-data-ingestion]: drizzle-orm added as direct dependency to packages/ingestion — normalizers need eq/and/sql helpers
- [Phase 02-core-data-ingestion]: connector registry uses switch/exhaustive check — Plan 03 (meta) and 05 (shopify) update with their connectors
- [Phase 02-core-data-ingestion]: cost_micros conversion in normalizer only — connector returns raw micros, normalizer handles USD conversion
- [Phase 02-core-data-ingestion]: facebook-nodejs-business-sdk imported via require() with manual type declarations — SDK has no bundled .d.ts types
- [Phase 02-core-data-ingestion]: Meta attributionWindow hardcoded to '7d_click' — only supported default after Jan 2026 unification; stored in raw_api_pulls for re-normalization if windows change
- [Phase 02-core-data-ingestion]: Meta ctr stored as decimal (percentage / 100) — Meta API returns '2.34' meaning 2.34%; normalized to 0.023400 matching campaign_metrics numeric(8,6)
- [Phase 02-core-data-ingestion]: fetchMetricsBulk is Shopify-specific (not on PlatformConnector interface) — processShopifySync imports ShopifyConnector directly for bulk path when date range >30 days
- [Phase 02-core-data-ingestion]: Synthetic 'shopify-revenue' campaign per tenant for Phase 2 revenue aggregation — per-campaign UTM attribution is Phase 3/4 concern
- [Phase 02-core-data-ingestion]: Single BullMQ queue for all ingestion job types — scheduler ID nightly-{platform}-{tenantId}-{integrationId}, upsertJobScheduler at 0 2 * * * (2am UTC), idempotent on every deploy/reconnect
- [Phase 02-core-data-ingestion]: Worker concurrency 3 — parallel sync across tenants/platforms without overwhelming DB pool
- [Phase 02-core-data-ingestion]: Rate limiting via sync_runs table count (no Redis TTL) — max 3 manual syncs/day + 1-hour cooldown per integration
- [Phase 02-core-data-ingestion]: apps/web added drizzle-orm and date-fns as direct dependencies — API routes use Drizzle helpers and date-fns freshness formatting directly
- [Phase 02-core-data-ingestion]: Auto-backfill fire-and-forget from OAuth callbacks — HTTP response returns immediately, errors logged not propagated
- [Phase 02-core-data-ingestion]: DB progressMetadata updated alongside job.updateProgress — BullMQ for real-time polling, DB for durability across worker restarts

### Pending Todos

- Run Drizzle migration 0002_legal_puma.sql against production DB (after app_user role exists)
- Configure OAuth env vars (FACEBOOK_APP_ID, GOOGLE_ADS_CLIENT_ID, SHOPIFY_API_KEY, etc.) before OAuth flows work
- Configure Redis env vars (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD) before worker process starts
- Deploy worker process (packages/ingestion/src/scheduler/workers.ts) as separate Node.js process alongside Next.js app

### Blockers/Concerns

- CausalPy production readiness is LOW confidence — verify before committing to this library. Fallback: causalimpact (Python port of Google's BSTS R library) or raw PyMC.
- Better Auth organization/role model needs verification that it supports all four required role levels before Phase 6 scaffold commits.
- TimescaleDB availability on Railway — plan for custom Docker image. Verify before infrastructure provisioning.
- app_user PostgreSQL role must be created by DBA/infra before migrations run — not managed by Drizzle.
- TOKEN_ENCRYPTION_KEY env var must be set before packages/ingestion crypto module is usable — 32 bytes as 64 hex chars

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 02-06-PLAN.md — BullMQ scheduler (upsertJobScheduler 2am UTC cron), processBackfillJob (month-by-month chunks, live progress, ARCH-03 gate), processSyncJob (incremental/manual, first-sync detects null lastSyncedAt), worker (concurrency 3, graceful shutdown), manual sync API (rate-limited), per-integration status (last 7 runs + freshness), global freshness summary, all three OAuth callbacks now auto-enqueue 3yr backfill + register nightly sync. Phase 2 complete.
Resume file: None
