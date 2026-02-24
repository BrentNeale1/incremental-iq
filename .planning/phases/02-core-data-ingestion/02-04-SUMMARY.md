---
phase: 02-core-data-ingestion
plan: 04
subsystem: ingestion
tags: [google-ads, connector, normalizer, gaql, cost-micros, mcc, two-stage-pipeline]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [google-ads-connector, google-ads-normalizer, connector-registry]
  affects: [02-05, 02-06]
tech_stack:
  added: [drizzle-orm (direct dep in ingestion package)]
  patterns: [GAQL queries, cost_micros to USD conversion, quarterly date chunking, p-retry with jitter, two-stage raw-to-normalized pipeline, withTenant RLS context]
key_files:
  created:
    - packages/ingestion/src/connectors/google-ads.ts
    - packages/ingestion/src/connectors/index.ts
    - packages/ingestion/src/normalizers/google-ads.ts
  modified:
    - packages/ingestion/package.json
decisions:
  - drizzle-orm added as direct dependency to packages/ingestion — normalizers need eq/and/sql helpers; re-exporting from @incremental-iq/db not feasible
  - connector registry uses switch/exhaustive check — Plan 03 (meta) and 05 (shopify) will update with their connectors
  - cost_micros conversion in normalizer only — connector returns raw micros, normalizer handles USD conversion
  - Quarterly chunking for date ranges >1 year using date-fns eachQuarterOfInterval
metrics:
  duration: 5 min
  completed: 2026-02-24
  tasks_completed: 2
  files_created: 3
  files_modified: 1
requirements: [INTG-02]
---

# Phase 2 Plan 4: Google Ads Connector and Normalizer Summary

**One-liner:** Google Ads connector via Opteo google-ads-api with GAQL queries, MCC support, and cost_micros-to-USD normalizer following two-stage raw-to-normalized pipeline.

## What Was Built

### Task 1: Google Ads API Connector + Connector Registry

**`packages/ingestion/src/connectors/google-ads.ts`** — `GoogleAdsConnector` implementing `PlatformConnector`:

- `fetchCampaigns(config)`: GAQL query for `campaign.id`, `campaign.name`, `campaign.status` — skips REMOVED campaigns
- `fetchMetrics(config, dateRange)`: GAQL query for daily metrics including `cost_micros`, `clicks`, `impressions`, `ctr`, `average_cpm`, `segments.date`
- **MCC support**: `loginCustomerId` from `config.credentials.metadata` passed to `client.Customer({ login_customer_id })` — prevents `USER_PERMISSION_DENIED` on manager accounts (RESEARCH.md Pitfall 5)
- **Quarterly chunking**: date ranges >1 year split using `date-fns` `eachQuarterOfInterval` — avoids response size issues on large backfills
- **p-retry**: 5 retries, 10s base timeout, `randomize: true` for jitter — `AbortError` on non-retryable codes (`AUTHENTICATION_ERROR`, `AUTHORIZATION_ERROR`, `INVALID_ARGUMENT`)
- `refreshTokenIfNeeded(config)`: no-op — Google refresh tokens do not expire; library handles access token refresh automatically

**`packages/ingestion/src/connectors/index.ts`** — Connector registry:

- `getConnector(platform: Platform): PlatformConnector` — singleton factory
- `'google_ads'` → `GoogleAdsConnector`
- `'meta'` and `'shopify'` throw descriptive errors (Plans 03 and 05 will implement)
- Exhaustive switch check (`never` type) catches future platforms

### Task 2: Google Ads Normalizer

**`packages/ingestion/src/normalizers/google-ads.ts`** — Two-stage raw-to-normalized pipeline:

**Stage 1 — `storeRawPull(params)`:**
- Inserts verbatim GAQL response into `raw_api_pulls`
- `source: 'google_ads'`, `apiVersion: 'v23'`, `normalized: false`
- Uses `withTenant` for RLS context

**Stage 2 — `normalizeGoogleAdsMetrics(params)`:**
- Validates payload with Zod (`GaqlMetricPayloadSchema`) before any DB writes
- **CRITICAL cost_micros conversion**: `spendUsd = costMicros / 1_000_000` (1M micros = $1 USD)
- **CPM conversion**: `cpm = averageCpm / 1_000_000` (also in micros)
- `ctr` passed through as decimal (Google provides 0.0234 = 2.34%, not percentage)
- Maps `campaign.id` (Google externalId) → internal UUID via `campaigns` table lookup
- Skips rows with no matching campaign UUID (with console.warn)
- Upserts into `campaignMetrics` with 4-column conflict target: `(tenantId, campaignId, date, source)` — idempotent
- `directRevenue`, `directConversions`, `directRoas` = NULL — ad platform, revenue comes from Shopify (Plan 05)
- Marks `rawApiPulls.normalized = true`, sets `normalizedAt`, `schemaVersion = '1.0'`

**`processGoogleAdsSync(params)`** — Top-level orchestrator:
1. Load integration record, decrypt tokens with `decryptToken()`
2. `syncCampaignHierarchy()` — upsert campaigns (select-then-insert/update pattern)
3. `connector.fetchMetrics()` — raw GAQL results
4. `storeRawPull()` — raw_api_pulls Stage 1
5. `normalizeGoogleAdsMetrics()` — campaign_metrics Stage 2
6. Upsert `ingestionCoverage` for each date in range

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added drizzle-orm as direct dependency to packages/ingestion**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** Normalizer imports `eq`, `and`, `sql` from `drizzle-orm` — not a direct dep of `packages/ingestion`; only available transitively through `@incremental-iq/db`
- **Fix:** Added `"drizzle-orm": "0.45.1"` to `packages/ingestion/package.json` dependencies; ran `pnpm install`
- **Files modified:** `packages/ingestion/package.json`
- **Commit:** 9ecaf7b

### Out-of-Scope Discoveries (Logged to deferred-items.md)

**shopify.ts TypeScript errors** — Pre-created stub for Plan 05 has TypeScript errors (`GraphqlClient` type constraint mismatch, implicit `any` types). These pre-date Plan 04 and will be resolved by Plan 05. Documented in `deferred-items.md`.

## Verification Results

1. `npx tsc --noEmit --skipLibCheck` — zero errors in google-ads.ts connector and normalizer
2. `connectors/google-ads.ts` imports from `google-ads-api`, uses GAQL queries via `customer.query()`
3. `normalizers/google-ads.ts` divides `cost_micros` by `1_000_000` at lines 181, 187
4. `normalizers/google-ads.ts` uses `onConflictDoUpdate` with all 4 target columns
5. MCC support: `loginCustomerId` passed to `client.Customer({ login_customer_id })` at line 81
6. Connector registry updated in `connectors/index.ts` — `google_ads` → `GoogleAdsConnector`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c37f8f4 | feat(02-04): Google Ads API connector + connector registry |
| Task 2 | 9ecaf7b | feat(02-04): Google Ads normalizer with cost_micros conversion |

## Self-Check: PASSED

All created files exist on disk:
- FOUND: `packages/ingestion/src/connectors/google-ads.ts`
- FOUND: `packages/ingestion/src/connectors/index.ts`
- FOUND: `packages/ingestion/src/normalizers/google-ads.ts`
- FOUND: `.planning/phases/02-core-data-ingestion/02-04-SUMMARY.md`

All commits verified:
- FOUND: c37f8f4 (Task 1: connector + registry)
- FOUND: 9ecaf7b (Task 2: normalizer)
