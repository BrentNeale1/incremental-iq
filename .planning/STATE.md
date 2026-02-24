# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.
**Current focus:** Phase 4 - Recommendations and Dashboard (IN PROGRESS)

## Current Position

Phase: 4 of 6 (Recommendations and Dashboard) - IN PROGRESS
Plan: 5 of 6 in current phase - COMPLETE (Plans 01-05 done; Plan 06 remaining)
Status: Phase 4 Plans 01-05 COMPLETE — UI foundation + recommendation engine + 9 API routes + marketing performance page + seasonality page + statistical insights page + data health page. All 5 dashboard pages navigable.
Last activity: 2026-02-25 — Completed Plan 05: Statistical Insights page (model health overview, CI charts, forecast vs actual, 12-month progression, methodology sidebar, drill-down table) + Data Health page (sync status with stale warnings, 90-day data gap timeline, integration settings) + 3 new hooks (useIncrementality, useSaturation, useSyncHistory).

Progress: [████████░░] 80%

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
| 03-statistical-engine | 2 | 16 min | 8 min |

**Recent Trend:**
- Last 6 plans: 4 min, 3 min, 3 min, 8 min, 5 min, 9 min, 9 min, 5 min
- Trend: stable

*Updated after each plan completion*

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 02-core-data-ingestion | P03 | 7 min | 2 tasks | 3 files |
| 02-core-data-ingestion | P05 | 9 min | 2 tasks | 3 files |
| 02-core-data-ingestion | P06 | 9 min | 3 tasks | 11 files |
| 03-statistical-engine | P01 | 11 min | 2 tasks | 7 files |
| 03-statistical-engine | P02 | 5 min | 2 tasks | 13 files |
| 03-statistical-engine | P03 | 4 min | 2 tasks | 6 files |
| 03-statistical-engine | P04 | 64 min | 3 tasks | 9 files |
| 03-statistical-engine | P05 | 18 min | 2 tasks | 6 files |
| Phase 03-statistical-engine PP06 | 10 min | 3 tasks | 11 files |
| Phase 04-recommendations-and-dashboard PP01 | 10 min | 2 tasks | 37 files |
| Phase 04-recommendations-and-dashboard PP02 | 11 min | 2 tasks | 11 files |
| Phase 04-recommendations-and-dashboard PP05 | 25 min | 2 tasks | 14 files |

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
- [Phase 03-statistical-engine]: score_type discriminator on incrementality_scores stores adjusted and raw scores per campaign — enables dual seasonally-adjusted/raw output per user decision without separate tables
- [Phase 03-statistical-engine]: nullable tenantId on seasonal_events distinguishes system events (readable by all tenants) from brand events (tenant-scoped) — RLS uses IS NULL OR matches tenant
- [Phase 03-statistical-engine]: nullable marketId on incrementality_scores is STAT-05 scaffold for Phase 5 geo-based testing — NULL in Phase 3 (single-market scoring)
- [Phase 03-statistical-engine]: 0003_statistical_engine.sql authored manually (drizzle-kit unavailable in shell) — follows exact drizzle-kit output pattern from prior migrations; functionally identical to generated output
- [Phase 03-statistical-engine]: uv used as Python package manager for packages/analysis — uv.lock for reproducible installs, .python-version pins to 3.11 (PyMC ecosystem stability)
- [Phase 03-statistical-engine]: IncrementalityResponse dual output (adjusted + raw) hardcoded at schema level per CONTEXT.md decision — schema enforces the product decision
- [Phase 03-statistical-engine]: get_retail_events uses algorithmic date computation — Easter uses Gregorian algorithm, nth/last-weekday helpers for floating holidays; 12 events per year
- [Phase 03-statistical-engine]: Prime Day anchored to Jul 12 as estimate — ForecastRequest.user_events allows override with actual announced date
- [Phase 03-statistical-engine]: SaturationResponse.saturation_percent is Optional[float] with status field — None when fitting fails, distinguishes estimated/insufficient_variation/error
- [Phase 03-statistical-engine]: Prophet lower_window stored as positive int in retail_calendar (human-readable), negated in to_prophet_holidays() — Prophet 1.3.0 requires lower_window <= 0
- [Phase 03-statistical-engine]: FastAPI router handler path is "/" not "/forecast" — router mounted with prefix="/forecast" in main.py; handler "/forecast" would yield /forecast/forecast (404)
- [Phase 03-statistical-engine]: Zero-spend filtering threshold is 20% — campaigns with ≤20% zero-spend rows keep them (legitimate weekend pause); above 20% filtered to avoid corrupting Prophet weekly seasonality
- [Phase 03-statistical-engine]: STL period=7, seasonal=13, robust=True for anomaly detection — weekly campaign cycles with robust smoother downweights outlier influence during decomposition
- [Phase 03-statistical-engine]: Seasonal strength formula: 1 - var(resid)/var(seasonal + resid) — measures weekly pattern strength, clamped to [0,1]
- [Phase 03-statistical-engine]: Budget change detection uses raw SQL FILTER clause — pre/post windowed average comparison too complex for Drizzle ORM query builder; sql template literal keeps it type-safe
- [Phase 03-statistical-engine]: 3-day spend smoothing via SQL ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING before threshold comparison — Pitfall 5 mitigation for billing cycle false positives
- [Phase 03-statistical-engine]: cores=1 for PyMC on Windows: FastAPI uvicorn workers are not the __main__ module; PyMC spawn-based multiprocessing requires __main__ guard. Production Linux Docker can use cores=4.
- [Phase 03-statistical-engine]: CausalPy post-period extraction via get_plot_data_bayesian(hdi_prob): posterior['mu'] is (chains, draws, pre_obs, treated_units) covering only pre-period; use get_plot_data_bayesian() to get impact/HDI columns for post-period.
- [Phase 03-statistical-engine]: Hierarchical pooling uses observed/latent split: data-rich campaigns observed=lift_mean (slight shrinkage toward cluster); sparse campaigns unobserved (posterior pulled toward cluster hyperprior with 2x sigma for honest uncertainty).
- [Phase 03-statistical-engine]: Hill saturation CV threshold at 0.15: spend std/mean < 0.15 returns insufficient_variation status with saturation_percent=None, preventing nonsensical curve fits on flat-budget campaigns.
- [Phase 03-statistical-engine]: Separate scoring BullMQ queue from ingestion queue: Python is CPU-heavy, separate queue allows independent concurrency tuning (concurrency=2 vs 3)
- [Phase 03-statistical-engine]: redisConnection extracted to scheduler/redis.ts to break circular dependency between queues.ts and scoring/dispatch.ts
- [Phase 03-statistical-engine]: Rollup sentinel convention: deterministic pseudo-UUID campaignId for rollup rows in incrementality_scores, groupKey encoded in rawModelOutput.groupKey
- [Phase 04-recommendations-and-dashboard]: shadcn/ui init on Windows requires Tailwind pre-installed + manual dep install when pnpm not on PATH in child process
- [Phase 04-recommendations-and-dashboard]: Rollup sentinel rows filtered via INNER JOIN campaigns (not campaignId LIKE 'rollup:%') — INNER JOIN is more robust: rollup rows have pseudo-UUIDs not in campaigns table
- [Phase 04-recommendations-and-dashboard]: holdoutTestDesign field strictly absent on scale_up action (RECC-06) — engine guarantees this; UI checks field existence to conditionally render holdout option
- [Phase 04-recommendations-and-dashboard]: Explicit return type annotation on withTenant<T>() calls required — TypeScript strict mode collapses inferred type to '{}' without annotation; all API routes use 'const rows: MyType[] = await withTenant(...)'
- [Phase 04-recommendations-and-dashboard]: Seasonal alerts wrapped in try/catch (non-critical) — recommendation list must succeed even if seasonal data query fails
- [Phase 04-recommendations-and-dashboard]: Zustand persist requires skipHydration: true for Next.js App Router — client calls useDashboardStore.persist.rehydrate() after mount
- [Phase 04-recommendations-and-dashboard]: TanStack Query SSR-safe pattern: typeof window === undefined guard creates per-request instance on server, reuses cached instance in browser
- [Phase 04-recommendations-and-dashboard]: Tailwind v4 uses CSS-based config (postcss.config.mjs + @import tailwindcss in globals.css) — no tailwind.config.js needed
- [Phase 04-recommendations-and-dashboard]: ConfidenceIntervalChart uses stacked Recharts Area (ciBase transparent + ciBand gradient) — dark-mode safe CI band visualization without white-fill masking
- [Phase 04-recommendations-and-dashboard]: ForecastActualChart forecast is scaffold (liftMean * 1.08) — actual Prophet baseline wired in Phase 5 when /api/dashboard/forecast endpoint exists
- [Phase 04-recommendations-and-dashboard]: useSyncHistory wraps /api/integrations/status (Phase 2) — dedicated sync_runs history endpoint deferred to Phase 5
- [Phase 04-recommendations-and-dashboard]: DataGapsTimeline infers coverage from staleSinceHours — per-day granularity requires sync_runs grouped by date (Phase 5 enhancement)
- [Phase 04-recommendations-and-dashboard]: IntegrationSettings Disconnect button disabled placeholder — Phase 6 (auth) implements integration removal with credential cleanup

### Pending Todos

- Run Drizzle migrations 0002_legal_puma.sql and 0003_statistical_engine.sql against production DB (after app_user role exists)
- Configure OAuth env vars (FACEBOOK_APP_ID, GOOGLE_ADS_CLIENT_ID, SHOPIFY_API_KEY, etc.) before OAuth flows work
- Configure Redis env vars (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD) before worker process starts
- Deploy worker process (packages/ingestion/src/scheduler/workers.ts) as separate Node.js process alongside Next.js app

### Blockers/Concerns

- CausalPy 0.7.0 verified working in Plan 04: ITS model fits correctly, get_plot_data_bayesian() extracts post-period impact with HDI. Windows requires cores=1; production Linux Docker should use cores=4. No fallback needed.
- Better Auth organization/role model needs verification that it supports all four required role levels before Phase 6 scaffold commits.
- TimescaleDB availability on Railway — plan for custom Docker image. Verify before infrastructure provisioning.
- app_user PostgreSQL role must be created by DBA/infra before migrations run — not managed by Drizzle.
- TOKEN_ENCRYPTION_KEY env var must be set before packages/ingestion crypto module is usable — 32 bytes as 64 hex chars

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 04-05-PLAN.md — Statistical Insights page (ModelHealthOverview, ConfidenceIntervalChart, ForecastActualChart, ProgressionView, MethodologySidebar, DrillDownTable) + Data Health page (SyncStatusList, DataGapsTimeline, IntegrationSettings) + 3 hooks (useIncrementality, useSaturation, useSyncHistory). All 5 dashboard pages now navigable. Plan 06 remaining for phase completion.
Resume file: None
