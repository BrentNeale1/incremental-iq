# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.
**Current focus:** Phase 6 - Authentication (UAT retest failures — needs second gap closure)

## Current Position

Phase: 6 of 6 (Authentication) - UAT GAPS REMAIN
Plan: 4 of 4 executed, but retest shows 3 of 4 fixes insufficient
Status: 06-04 gap closure executed. CSS fix confirmed working. Login, sign-up, and page routing still broken — fixes were insufficient, deeper investigation needed.
Last activity: 2026-02-25 — Post-gap-closure retest. User confirmed CSS fixed but login not logging in, registration refreshes page, page paths not displaying correctly.
Stopped at: Awaiting second gap closure cycle. Need /gsd:debug or deeper investigation before next plan.

Progress: [████████░░] 80% (code complete, auth flows not functional)

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
| Phase 05-expanded-connectors-and-multi-market P01 | 7 | 2 tasks | 9 files |
| Phase 05-expanded-connectors-and-multi-market PP02 | 12 min | 2 tasks | 9 files |
| Phase 06-authentication P01 | 7 | 2 tasks | 20 files |
| Phase 06-authentication P02 | 4 min | 2 tasks | 17 files |
| Phase 06-authentication P03 | ~90 min | 2 tasks | 41 files |
| Phase 06-authentication P04 | 8 min | 2 tasks | 4 files |

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
- [Phase 05-expanded-connectors-and-multi-market]: markets.campaignCount uses integer (not numeric) — integer matches Drizzle type for a count field
- [Phase 05-expanded-connectors-and-multi-market]: detectMarketsForTenant uses raw SQL upsert for campaign_markets ON CONFLICT (tenant_id, campaign_id) DO UPDATE — cleaner than select-then-insert for unique index
- [Phase 05-expanded-connectors-and-multi-market]: NULL marketId in campaign_markets = Global/Unassigned bucket (not a sentinel UUID) — matches user decision from CONTEXT.md
- [Phase 05-expanded-connectors-and-multi-market]: GA4Connector does NOT implement PlatformConnector — outcome source with separate getGA4Connector() factory; Platform type extended to include 'ga4'
- [Phase 05-expanded-connectors-and-multi-market]: GA4 lead counts stored in directConversions column (not directRevenue) — same column used by Shopify orders; outcomeMode gates which column is the primary outcome signal
- [Phase 05-expanded-connectors-and-multi-market]: No GA4 backfill from OAuth callback — requires property + event selection first; POST /api/ga4/events triggers backfill eligibility (Plan 06 scheduler responsibility)
- [Phase 06-authentication]: Better Auth v1.4.19 with drizzleAdapter — no RLS on auth tables, no cookieCache, 30-day sliding sessions, tenantId additionalField on user
- [Phase 06-authentication]: TenantProvider React context distributes tenantId to dashboard client components — useTenantId() replaces PLACEHOLDER_TENANT_ID in all 5 dashboard pages
- [Phase 06-authentication]: Sign-up server action creates tenant first then auth.api.signUpEmail with tenantId — rollback on user creation failure prevents orphan tenants
- [Phase 06-authentication]: All dashboard API routes use session-based tenantId (auth.api.getSession) not query params — eliminates IDOR vulnerability
- [Phase 06-authentication]: signOut uses fetchOptions.onSuccess callback with router.push('/login') + router.refresh() — clears Next.js router cache (Pitfall 2)
- [Phase 06-authentication]: OAuth routes (/api/oauth/*) excluded from session retrofit — run during pre-auth OAuth flow, use own tenant resolution
- [Phase 06-authentication]: DashboardLayoutClient passes tenantId to TenantProvider only — AppHeader, StaleDataBanner, SidebarNav use hooks directly; no tenantId prop chain
- [Phase 06-authentication]: PUT body types for markets and tenant/preferences no longer accept tenantId field — eliminates all client-supplied tenantId vectors (not just query params)
- [Phase 06-authentication]: isRedirectError from next/dist/client/components/redirect-error re-thrown in signup catch block — NEXT_REDIRECT must propagate, not be swallowed as a generic error
- [Phase 06-authentication]: callbackURL: '/' added to authClient.signIn.email() — Better Auth needs explicit redirect target so cookie is set before client navigation fires
- [Phase 06-authentication]: onBlur handler added to forgot-password email input — browser autofill sets DOM value without firing React synthetic onChange; onBlur syncs value when user tabs away
- [Phase 06-authentication]: shadcn/tailwind.css import removed from globals.css — package import fails on cold reload triggered by middleware redirects; all theme declarations already inlined

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
Stopped at: Post-gap-closure UAT retest — 3 of 4 fixes insufficient
Resume with: /gsd:debug to investigate why login, sign-up, and page routing still fail after 06-04 fixes
Key context: CSS fix works. Login/sign-up/routing have a deeper systemic issue beyond the individual code fixes (env vars, callbackURL, isRedirectError). Likely middleware, Better Auth config, or Next.js routing problem.
Resume file: None
