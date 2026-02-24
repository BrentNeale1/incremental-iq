---
phase: 02-core-data-ingestion
plan: 03
subsystem: ingestion/meta
tags: [meta-ads, connector, normalizer, facebook-sdk, p-retry, drizzle, rls, zod]
requirements: [INTG-01]

dependency_graph:
  requires:
    - 02-01  # packages/ingestion package scaffold with types and connector-base
    - 02-02  # integrations/sync_runs schema and OAuth routes
  provides:
    - Meta Ads connector implementing PlatformConnector (fetchCampaigns, fetchMetrics, refreshTokenIfNeeded)
    - Meta normalizer with two-stage raw-to-normalized pipeline
    - Connector registry getConnector('meta') returns MetaConnector
  affects:
    - packages/ingestion/src/connectors/index.ts (MetaConnector registered)
    - packages/ingestion/src/connectors/meta.ts (new file)
    - packages/ingestion/src/normalizers/meta.ts (new file)

tech_stack:
  added:
    - facebook-nodejs-business-sdk v23 (already in package.json — used via require() due to no types)
    - p-retry v6 (exponential backoff + jitter for Meta API calls)
    - p-limit v5 (concurrency control: max 3 concurrent Meta API calls)
  patterns:
    - Two-stage raw-to-normalized pipeline (RESEARCH.md Pattern 1)
    - p-retry with AbortError for non-retryable errors (RESEARCH.md Pattern 5)
    - Async Meta reporting for date ranges > 7 days (RESEARCH.md Pitfall 7)
    - 4-column upsert conflict target (RESEARCH.md Pitfall 8)
    - withTenant() RLS context on all DB operations (RESEARCH.md Pitfall 6)
    - Attribution window stored alongside every raw pull (RESEARCH.md Pitfall 1)

key_files:
  created:
    - packages/ingestion/src/connectors/meta.ts
    - packages/ingestion/src/normalizers/meta.ts
  modified:
    - packages/ingestion/src/connectors/index.ts

decisions:
  - facebook-nodejs-business-sdk imported via require() with manual type declarations — SDK has no bundled .d.ts types, and the tsconfig uses 'bundler' module resolution which conflicts with its CJS-only exports
  - attributionWindow hardcoded to '7d_click' in processMetaSync — after Meta unified attribution Jan 2026, this is the only supported default; stored in raw_api_pulls for re-normalization if windows change
  - ctr stored as decimal (Meta percentage divided by 100) — Meta API returns "2.34" meaning 2.34%; DB stores as 0.023400 matching the campaign_metrics numeric(8,6) column definition
  - syncCampaignHierarchy uses select-then-insert pattern — campaigns table has no unique constraint on (tenantId, source, externalId), so a single upsert is not possible without a DB schema change (which would be a Rule 4 architectural decision)
  - Direct attribution columns (directRevenue, directConversions, directRoas) always NULL for Meta — Meta is spend-source only; revenue attribution comes from Shopify connector (Plan 05)

metrics:
  duration_seconds: 398
  duration_human: "7 min"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
  completed_date: "2026-02-24"
---

# Phase 02 Plan 03: Meta Ads Connector and Normalizer Summary

**One-liner:** Meta Ads connector using facebook-nodejs-business-sdk v23 with async reporting, p-retry backoff, and a two-stage raw-to-normalized pipeline storing attribution window alongside every raw pull.

## What Was Built

### Task 1: Meta Ads API Connector (`packages/ingestion/src/connectors/meta.ts`)

Implemented `MetaConnector` class satisfying the `PlatformConnector` interface:

**`fetchCampaigns(config)`**
- Initializes `FacebookAdsApi` with decrypted access token
- Fetches campaign hierarchy (campaigns -> ad sets -> ads) from `act_${adAccountId}`
- Uses `p-limit(3)` to cap concurrent API calls at 3 simultaneous requests
- All API calls wrapped in `withRetry()` using `p-retry` with 5 retries, 30s base, randomize jitter
- Error code 17/613 (rate limit) -> retryable; code 100 (invalid param) -> `AbortError` (no retry)

**`fetchMetrics(config, dateRange)`**
- Date ranges <= 7 days: synchronous `account.getInsights()`
- Date ranges > 7 days: async reporting via `account.getInsightsAsync()` (RESEARCH.md Pitfall 7)
  - Polls async job every 60 seconds, max 60 attempts (1 hour timeout)
  - `Job Completed` -> retrieve results; `Job Failed/Skipped` -> throw
- Only requests aggregate totals: `['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr']`
- No breakdown or unique-count fields (13-month limit, RESEARCH.md Pitfall 2)

**`refreshTokenIfNeeded(config)`**
- Checks `tokenExpiresAt` from integration metadata
- If within 7 days of expiry, exchanges for new long-lived token via `https://graph.facebook.com/v23.0/oauth/access_token?grant_type=fb_exchange_token`
- Returns unchanged credentials if no refresh needed or no expiry stored

**Connector registry update (`packages/ingestion/src/connectors/index.ts`)**
- `case 'meta': return new MetaConnector()` — previously threw placeholder error

### Task 2: Meta Normalizer (`packages/ingestion/src/normalizers/meta.ts`)

Implemented the two-stage pipeline (RESEARCH.md Pattern 1):

**Stage 1 — `storeRawPull(params)`**
- Inserts raw Meta Insights response into `raw_api_pulls` verbatim
- `source: 'meta'`, `apiVersion: 'v23.0'`
- `attributionWindow: '7d_click'` stored alongside payload (RESEARCH.md Pitfall 1)
- `normalized: false` — not yet processed
- Returns raw_api_pulls record UUID for Stage 2 reference

**Stage 2 — `normalizeMetaInsights(params)`**
- Validates raw payload with Zod `MetaInsightPayloadSchema` before DB writes
- Resolves Meta campaign_id (externalId) to internal campaign UUID via campaigns table lookup
- CTR conversion: Meta percentage string "2.34" -> decimal 0.023400 (divided by 100)
- Upserts to `campaignMetrics` with 4-column conflict target (RESEARCH.md Pitfall 8):
  `[tenantId, campaignId, date, source]`
- Direct attribution columns (`directRevenue`, `directConversions`, `directRoas`) = NULL
- Updates `rawApiPulls.normalized = true` after successful upsert

**`processMetaSync(params)` — Top-level orchestrator**
1. Load integration, decrypt access token
2. Call `refreshTokenIfNeeded()` before any API calls
3. `syncCampaignHierarchy()` — upserts campaigns/ad sets/ads into DB
4. `fetchMetrics()` — raw Meta Insights for date range
5. `storeRawPull()` — Stage 1 (raw API response to DB first)
6. `normalizeMetaInsights()` — Stage 2 (transform and upsert to campaign_metrics)
7. `ingestionCoverage` update for each date in range
- All DB operations use `withTenant(tenantId, ...)` for RLS context (RESEARCH.md Pitfall 6)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] facebook-nodejs-business-sdk has no TypeScript type declarations**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** SDK distributed as CJS-only with no `.d.ts` file; `import adsSdk from 'facebook-nodejs-business-sdk'` caused TS7016 (implicit any) and downstream TS18046 errors on SDK return values
- **Fix:** Replaced ESM import with `require()` cast with manually typed interface declarations (`MetaAdAccount`, `MetaApiObject`, `MetaAsyncJob`) to provide correct TypeScript types without modifying the SDK
- **Files modified:** `packages/ingestion/src/connectors/meta.ts`
- **Commit:** 9f2d242

### Out-of-Scope Pre-existing Issues (deferred)

The following TypeScript errors existed before Plan 03 execution and are not caused by this plan's changes. Logged to `deferred-items.md`:

- `packages/ingestion/src/connectors/shopify.ts`: 12 TypeScript errors (GraphQL client type mismatches, implicit any types) — Plan 05's responsibility

## Verification Results

1. `cd packages/ingestion && npx tsc --noEmit --skipLibCheck` — zero errors in meta files
2. `connectors/meta.ts` imports from `facebook-nodejs-business-sdk` (via require) and uses `p-retry` — confirmed
3. `normalizers/meta.ts` uses `onConflictDoUpdate` with all 4 target columns — confirmed (line 247-252)
4. `normalizers/meta.ts` writes to `rawApiPulls` BEFORE `campaignMetrics` — confirmed (line 479 vs 493)
5. Attribution window stored in `rawApiPulls` via `storeRawPull` — confirmed (line 481)
6. All DB operations use `withTenant` for RLS context — confirmed (8 uses in normalizer)

## Self-Check: PASSED
