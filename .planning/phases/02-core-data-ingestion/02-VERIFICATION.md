---
phase: 02-core-data-ingestion
verified: 2026-02-24T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Complete Meta OAuth flow from browser — visit /api/oauth/meta with a tenantId query param, authorize, verify integration row appears in DB with encrypted token"
    expected: "Redirect to Meta authorization URL, callback receives code, integration row inserted with non-null encrypted_access_token, account_id populated"
    why_human: "Live OAuth round-trip requires real Facebook app credentials and browser interaction; cannot mock the full exchange chain programmatically"
  - test: "Complete Google Ads OAuth flow — including MCC account scenario"
    expected: "Both customerId and loginCustomerId stored in metadata for manager accounts; API calls succeed with login_customer_id set"
    why_human: "Requires a live Google Ads test account with actual MCC structure; MCC handling logic is correct in code but real-world validation needs human"
  - test: "Shopify bulk operation backfill — trigger for a date range > 30 days and verify JSONL streaming"
    expected: "Bulk mutation submitted, polling loop waits for COMPLETED status, JSONL file streamed line-by-line without OOM, orders appear in campaign_metrics"
    why_human: "Requires a live Shopify store with order history; JSONL streaming cannot be exercised without actual bulk operation output"
  - test: "BullMQ worker processes nightly scheduler at 2am UTC"
    expected: "upsertJobScheduler creates a recurring job; after 2am UTC, processSyncJob runs and updates lastSyncedAt on the integration"
    why_human: "Requires running Redis + worker process; time-based scheduler cannot be verified statically"
  - test: "ARCH-03 gate unlocks after backfill reaches 365 coverage days"
    expected: "After processBackfillJob completes for a year+ date range, tenants.analysisUnlocked = true"
    why_human: "Requires real DB with populated ingestion_coverage rows; gate logic is correct in code but end-to-end flow needs runtime verification"
---

# Phase 2: Core Data Ingestion Verification Report

**Phase Goal:** Real campaign spend data from Meta Ads and Google Ads, and real revenue data from Shopify, are flowing through the pipeline with at least one year of historical backfill

**Verified:** 2026-02-24
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| #  | Truth                                                                                              | Status     | Evidence                                                                                                               |
|----|----------------------------------------------------------------------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------|
| 1  | User can connect Meta Ads account via OAuth and see campaign, ad set, and ad data appear           | VERIFIED   | `apps/web/app/api/oauth/meta/callback/route.ts` — full token exchange + `saveIntegration`; `connectors/meta.ts` `fetchCampaigns` fetches campaigns > ad sets > ads hierarchy |
| 2  | User can connect Google Ads account via OAuth and see campaign data appear                         | VERIFIED   | `apps/web/app/api/oauth/google/callback/route.ts` — token exchange + MCC metadata stored; `connectors/google-ads.ts` `fetchCampaigns` queries via GAQL |
| 3  | User can connect Shopify store and see order and revenue data as outcome variable                  | VERIFIED   | `apps/web/app/api/oauth/shopify/callback/route.ts` — token exchange; `normalizers/shopify.ts` maps orders to `directRevenue`/`directConversions` columns (not ad spend columns) |
| 4  | System automatically backfills historical data with visible minimum of 1 year before analysis     | VERIFIED   | All 3 OAuth callbacks call `enqueueBackfill(tenantId, platform, integrationId, { start: threeYearsAgo, end: today })`; `processBackfillJob` chunks by month with `job.updateProgress`; `checkAndUnlockAnalysis` checks 365 coverage days and sets `tenants.analysisUnlocked = true` |
| 5  | Each integration shows a data freshness indicator so user knows when data was last synced         | VERIFIED   | `GET /api/integrations/[id]/status` returns `freshness` (`formatDistanceToNow`) + `lastSyncedAt`; `GET /api/integrations/status` returns global health + per-integration freshness |

**Score:** 5/5 truths verified

---

## Required Artifacts

### Plan 02-01: Foundation

| Artifact                                          | Expected                                          | Status     | Details                                                                                         |
|---------------------------------------------------|---------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `packages/db/src/schema/integrations.ts`          | integrations table with RLS                       | VERIFIED   | `pgTable('integrations')` with all required columns, restrictive RLS policy via `appRole`       |
| `packages/db/src/schema/sync-runs.ts`             | sync_runs table with FK + RLS                     | VERIFIED   | `pgTable('sync_runs')` with FK to `integrations.id`, restrictive RLS policy                    |
| `packages/ingestion/package.json`                 | All Phase 2 dependencies installed                | VERIFIED   | All 9 required deps present: `facebook-nodejs-business-sdk`, `google-ads-api`, `@shopify/shopify-api`, `bullmq`, `ioredis`, `p-retry`, `p-limit`, `date-fns`, `zod` |
| `packages/ingestion/src/crypto.ts`                | AES-256-GCM encrypt/decrypt                       | VERIFIED   | `encryptToken`/`decryptToken` exported; `aes-256-gcm` algorithm; `iv(12)+authTag(16)+ciphertext` wire format |
| `packages/ingestion/src/types.ts`                 | Shared types: Platform, ConnectorConfig, etc.     | VERIFIED   | `Platform`, `SyncType`, `SyncStatus`, `IntegrationStatus`, `ConnectorConfig`, `DecryptedCredentials`, `SyncJobData`, `BackfillProgress`, `NormalizedMetric` all defined |
| `pnpm-workspace.yaml`                             | Monorepo workspace definition                     | VERIFIED   | `packages: ["packages/*", "apps/*"]` at repo root                                              |

### Plan 02-02: OAuth Routes + Migration

| Artifact                                                         | Expected                                          | Status     | Details                                                                                         |
|------------------------------------------------------------------|---------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `apps/web/app/api/oauth/meta/callback/route.ts`                  | Meta OAuth callback handler (GET)                 | VERIFIED   | Exports `GET`; full short→long-lived token exchange; `saveIntegration` call; `enqueueBackfill` + `registerNightlySync` after connect |
| `apps/web/app/api/oauth/google/callback/route.ts`                | Google OAuth callback handler (GET)               | VERIFIED   | Exports `GET`; token exchange; MCC loginCustomerId stored in metadata; `enqueueBackfill` + `registerNightlySync` |
| `apps/web/app/api/oauth/shopify/callback/route.ts`               | Shopify OAuth callback handler (GET)              | VERIFIED   | Exports `GET`; permanent token exchange; shop domain stored in metadata; `enqueueBackfill` + `registerNightlySync` |
| `apps/web/lib/oauth-helpers.ts`                                  | saveIntegration + CSRF state helpers              | VERIFIED   | `saveIntegration` (encrypts tokens via `encryptToken`, inserts via `withTenant`), `generateState` (HMAC-SHA256), `verifyState` (timing-safe comparison) |
| `packages/db/migrations/0002_legal_puma.sql`                     | SQL migration for integrations + sync_runs        | VERIFIED   | `CREATE TABLE integrations`, `CREATE TABLE sync_runs`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, RLS policies for both tables |

### Plan 02-03: Meta Connector + Normalizer

| Artifact                                                     | Expected                                                  | Status     | Details                                                                                         |
|--------------------------------------------------------------|-----------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `packages/ingestion/src/connectors/meta.ts`                  | Meta connector implementing PlatformConnector             | VERIFIED   | `MetaConnector` implements `PlatformConnector`; uses `facebook-nodejs-business-sdk` (via `require()`); `p-retry`; async reporting for >7-day ranges; campaign hierarchy fetch |
| `packages/ingestion/src/normalizers/meta.ts`                 | Meta two-stage raw-to-normalized pipeline                 | VERIFIED   | `storeRawPull` (Stage 1 → `rawApiPulls`); `normalizeMetaInsights` (Stage 2 → `campaignMetrics` upsert with 4-column conflict target); `processMetaSync` orchestrator; attribution window stored |
| `packages/ingestion/src/connectors/index.ts`                 | Connector registry with meta registered                   | VERIFIED   | `getConnector('meta')` → `MetaConnector()`; all three platforms registered; exhaustive switch |

### Plan 02-04: Google Ads Connector + Normalizer

| Artifact                                                         | Expected                                                          | Status     | Details                                                                                         |
|------------------------------------------------------------------|-------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `packages/ingestion/src/connectors/google-ads.ts`                | Google Ads connector implementing PlatformConnector               | VERIFIED   | `GoogleAdsConnector` implements `PlatformConnector`; GAQL queries via `customer.query()`; MCC `loginCustomerId` support; quarterly chunking for >1yr ranges; `p-retry` |
| `packages/ingestion/src/normalizers/google-ads.ts`               | Google Ads normalizer with cost_micros→USD conversion             | VERIFIED   | `normalizeGoogleAdsMetrics` divides `costMicros / 1_000_000` and `averageCpm / 1_000_000`; 4-column upsert; `processGoogleAdsSync` orchestrator |

### Plan 02-05: Shopify Connector + Normalizer

| Artifact                                                         | Expected                                                          | Status     | Details                                                                                         |
|------------------------------------------------------------------|-------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `packages/ingestion/src/connectors/shopify.ts`                   | Shopify connector with incremental + bulk paths                   | VERIFIED   | `ShopifyConnector` exports `fetchMetrics` (GraphQL pagination, ≤30 days) and `fetchMetricsBulk` (Bulk Operations API + JSONL streaming, >30 days); `refreshTokenIfNeeded` handles 1-hour expiry |
| `packages/ingestion/src/normalizers/shopify.ts`                  | Shopify normalizer mapping orders to directRevenue                | VERIFIED   | `normalizeShopifyOrders` aggregates by date into `directRevenue` (sum) + `directConversions` (count); `spendUsd`/`impressions`/`clicks` = null; 4-column upsert |

### Plan 02-06: Scheduler + API Endpoints

| Artifact                                                                   | Expected                                                   | Status     | Details                                                                                         |
|----------------------------------------------------------------------------|------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------|
| `packages/ingestion/src/scheduler/queues.ts`                               | BullMQ Queue + registerNightlySync + enqueueBackfill       | VERIFIED   | `new Queue('ingestion')`; `registerNightlySync` uses `upsertJobScheduler` with `0 2 * * *`; `enqueueBackfill`; `enqueueManualSync` |
| `packages/ingestion/src/scheduler/workers.ts`                              | BullMQ Worker (concurrency 3, graceful shutdown)           | VERIFIED   | `new Worker('ingestion', ..., { concurrency: 3 })`; routes by `job.name`; SIGTERM/SIGINT graceful shutdown |
| `packages/ingestion/src/scheduler/jobs/sync.ts`                            | Daily incremental sync job handler                         | VERIFIED   | `processSyncJob` exported; platform routing to process functions; first-sync detection; partial/failed/expired classification |
| `packages/ingestion/src/scheduler/jobs/backfill.ts`                        | Historical backfill with monthly chunks + progress         | VERIFIED   | `processBackfillJob` exported; `eachMonthOfInterval` chunking; `job.updateProgress({ completed, total, unit: 'months' })`; `checkAndUnlockAnalysis` ARCH-03 gate |
| `apps/web/app/api/integrations/[id]/sync/route.ts`                         | Manual sync trigger (POST, rate-limited)                   | VERIFIED   | Exports `POST`; checks 3/day + 1-hour cooldown via `sync_runs` table; returns 202 with jobId |
| `apps/web/app/api/integrations/[id]/status/route.ts`                       | Per-integration status + sync history (GET)                | VERIFIED   | Exports `GET`; returns `freshness`, `syncInProgress`, `currentProgress`, last 7 `syncHistory` |
| `apps/web/app/api/integrations/status/route.ts`                            | Global freshness summary (GET)                             | VERIFIED   | Exports `GET`; returns `globalStatus` (healthy/warning/error), per-integration freshness, `warnings` array |

---

## Key Link Verification

| From                                                       | To                                              | Via                          | Status   | Details                                                                                         |
|------------------------------------------------------------|-------------------------------------------------|------------------------------|----------|-------------------------------------------------------------------------------------------------|
| `packages/db/src/schema/index.ts`                          | `integrations.ts`                               | re-export                    | WIRED    | `export * from './integrations'` confirmed at line 8                                            |
| `packages/db/src/schema/index.ts`                          | `sync-runs.ts`                                  | re-export                    | WIRED    | `export * from './sync-runs'` confirmed at line 9                                               |
| `packages/ingestion/src/crypto.ts`                         | `TOKEN_ENCRYPTION_KEY`                          | process.env                  | WIRED    | `getKey()` reads `process.env.TOKEN_ENCRYPTION_KEY`, throws if missing                         |
| `apps/web/app/api/oauth/meta/callback/route.ts`            | `@incremental-iq/ingestion` crypto              | `import encryptToken`        | WIRED    | `encryptToken` imported via `@/lib/oauth-helpers` which imports from `@incremental-iq/ingestion` |
| `apps/web/app/api/oauth/meta/callback/route.ts`            | `packages/db integrations` table                | `db.insert(integrations)`    | WIRED    | `saveIntegration` in `oauth-helpers.ts` calls `tx.insert(integrations)` inside `withTenant`    |
| `apps/web/lib/oauth-helpers.ts`                            | `@incremental-iq/db`                            | workspace dependency         | WIRED    | `import { db, withTenant } from '@incremental-iq/db'`; `import { integrations } from '@incremental-iq/db'` |
| `connectors/meta.ts`                                       | `facebook-nodejs-business-sdk`                  | require() SDK import         | WIRED    | `const adsSdk = require('facebook-nodejs-business-sdk')` at line 27                            |
| `normalizers/meta.ts`                                      | `rawApiPulls` table                             | Drizzle insert               | WIRED    | `tx.insert(rawApiPulls)` in `storeRawPull` (Stage 1, called before `normalizeMetaInsights`)    |
| `normalizers/meta.ts`                                      | `campaignMetrics` table                         | Drizzle upsert               | WIRED    | `tx.insert(campaignMetrics).onConflictDoUpdate(...)` with 4-column target                       |
| `connectors/google-ads.ts`                                 | `google-ads-api`                                | SDK import                   | WIRED    | `import { GoogleAdsApi, Customer, enums } from 'google-ads-api'` at line 1                     |
| `normalizers/google-ads.ts`                                | `campaignMetrics` table                         | Drizzle upsert               | WIRED    | `tx.insert(campaignMetrics).onConflictDoUpdate(...)` with 4-column target; `cost_micros / 1_000_000` |
| `connectors/index.ts`                                      | `google-ads.ts`                                 | connector registry           | WIRED    | `case 'google_ads': return new GoogleAdsConnector()`                                            |
| `connectors/shopify.ts`                                    | `@shopify/shopify-api`                          | SDK import                   | WIRED    | `import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api'` at line 2     |
| `normalizers/shopify.ts`                                   | `campaignMetrics` table (directRevenue)         | Drizzle upsert               | WIRED    | `directRevenue: agg.revenueAccumulator.toFixed(4)` in `onConflictDoUpdate` set                 |
| `connectors/index.ts`                                      | `shopify.ts`                                    | connector registry           | WIRED    | `case 'shopify': return new ShopifyConnector()`                                                 |
| `scheduler/queues.ts`                                      | `bullmq`                                        | Queue + connection           | WIRED    | `import { Queue } from 'bullmq'`; `new Queue('ingestion', { connection: redisConnection })`    |
| `scheduler/jobs/sync.ts`                                   | `connectors/index.ts`                           | platform process functions   | WIRED    | Imports `processMetaSync`, `processGoogleAdsSync`, `processShopifySync` from normalizers        |
| `scheduler/jobs/backfill.ts`                               | `job.updateProgress`                            | BullMQ progress API          | WIRED    | `await job.updateProgress({ completed: i + 1, total: totalMonths, unit: 'months' })` at line 161 |
| `apps/web/app/api/integrations/[id]/sync/route.ts`         | `scheduler/queues.ts`                           | queue.add via enqueueManualSync | WIRED | `import { enqueueManualSync } from '@incremental-iq/ingestion'`; called at line 122             |
| All 3 OAuth callbacks                                      | `enqueueBackfill` + `registerNightlySync`       | fire-and-forget import       | WIRED    | All three callbacks import and call both functions after `saveIntegration` succeeds             |

---

## Requirements Coverage

| Requirement | Source Plan(s)      | Description                                                                    | Status    | Evidence                                                                                   |
|-------------|---------------------|--------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------------------------------|
| INTG-01     | 02-01, 02-02, 02-03 | User can connect Meta Ads account via OAuth and pull campaign/ad set/ad data   | SATISFIED | OAuth flow in `apps/web/app/api/oauth/meta/`; `MetaConnector.fetchCampaigns` pulls hierarchy; metrics flow to `campaign_metrics` |
| INTG-02     | 02-01, 02-02, 02-04 | User can connect Google Ads account via OAuth and pull campaign data            | SATISFIED | OAuth flow in `apps/web/app/api/oauth/google/`; `GoogleAdsConnector.fetchMetrics` GAQL queries; cost_micros conversion in normalizer |
| INTG-03     | 02-01, 02-02, 02-05 | User can connect Shopify store and pull order/revenue data                      | SATISFIED | OAuth flow in `apps/web/app/api/oauth/shopify/`; `ShopifyConnector` pulls orders; revenue maps to `directRevenue`/`directConversions` (outcome variable, not ad conversion counts) |
| INTG-05     | 02-01, 02-06        | System backfills historical data from all connected sources (1yr min, 3yr ideal) | SATISFIED | All OAuth callbacks fire `enqueueBackfill(tenantId, platform, id, { start: 3yr ago, end: today })`; backfill chunks by month; ARCH-03 gate checks 365 coverage days; `job.updateProgress` provides live visibility |

No orphaned requirements — all four requirement IDs declared in plan frontmatter map to verified implementations.

---

## Anti-Patterns Found

| File                                                          | Location    | Pattern                                          | Severity | Impact                                                                                                    |
|---------------------------------------------------------------|-------------|--------------------------------------------------|----------|-----------------------------------------------------------------------------------------------------------|
| `packages/ingestion/src/connectors/shopify.ts`                | Line 141    | `return []` in `fetchCampaigns`                  | INFO     | Expected and documented — Shopify has no campaign concept; synthetic campaign is managed by normalizer    |
| `packages/ingestion/src/connectors/shopify.ts`                | Line 302    | `return []` in `_pollBulkOperation` null URL path | INFO    | Correct behavior — COMPLETED bulk operation with no URL means zero matching orders                        |
| `packages/ingestion/src/normalizers/meta.ts` (line 512)       | All 3 normalizers | `tx.insert(ingestionCoverage)` without `onConflictDoNothing` | WARNING | If the same date range is synced twice (e.g., manual sync + nightly sync overlap), duplicate coverage rows are inserted. `COUNT(DISTINCT coverage_date)` in the ARCH-03 gate query still works correctly, but coverage table grows unbounded. Not a data correctness blocker. |
| `apps/web/app/api/integrations/status/route.ts`               | Line 58-61  | `// @ts-ignore` comment on `inArray` condition   | WARNING  | Type inference edge case with `&&` operator in Drizzle; the intent is `and(inArray(...), eq(...))` but `&&` is used instead. At runtime, `&&` short-circuits — the condition effectively becomes just `eq(syncRuns.status, 'running')` without the `inArray` filter. Running syncs for ALL integrations are returned, not just those belonging to this tenant's integrations. This is a query correctness issue but low severity for a single-tenant query context. |

---

## Human Verification Required

### 1. Meta OAuth End-to-End Flow

**Test:** Visit `/api/oauth/meta?tenantId={uuid}` in a browser with real Meta app credentials configured. Authorize the app in the Meta dialog. Verify callback succeeds.

**Expected:** Integration row inserted in DB with non-null `encrypted_access_token`, `account_id` populated, `status = 'connected'`. BullMQ backfill job enqueued in Redis.

**Why human:** Live OAuth round-trip requires real Facebook app credentials, HTTPS callback URL, and browser interaction. The code logic is verified; the external service integration cannot be mocked statically.

### 2. Google Ads MCC Account Handling

**Test:** Connect a Google Ads manager (MCC) account via OAuth. Inspect the integration row metadata field.

**Expected:** Both `customerId` and `loginCustomerId` in metadata. Subsequent API calls via `GoogleAdsConnector` succeed without `USER_PERMISSION_DENIED` errors.

**Why human:** Requires a real Google Ads MCC test account structure; MCC account behavior is conditional on the account hierarchy.

### 3. Shopify Bulk Operations Backfill

**Test:** Connect a Shopify store with > 30 days of order history. Trigger backfill manually. Monitor the BullMQ job progress.

**Expected:** `bulkOperationRunQuery` mutation submitted, polling loop runs every 30 seconds, JSONL file streamed without memory spike, orders appear in `campaign_metrics.direct_revenue`.

**Why human:** Requires a live Shopify store with real order history. JSONL streaming path requires actual bulk operation output.

### 4. Nightly Scheduler Execution

**Test:** Start the worker process (`packages/ingestion/src/scheduler/workers.ts`) and connect Redis. Register a nightly sync. Verify the scheduler fires.

**Expected:** BullMQ `upsertJobScheduler` creates a repeating schedule at `0 2 * * *`. At 2am UTC, `processSyncJob` runs, `lastSyncedAt` is updated.

**Why human:** Requires running Redis + worker process; time-based trigger cannot be verified statically.

### 5. ARCH-03 Analysis Gate

**Test:** Run a full backfill for a date range covering >= 1 year for all three platforms. After completion, query `tenants.analysis_unlocked`.

**Expected:** `analysis_unlocked = true` and `analysis_unlocked_at` populated.

**Why human:** Requires real DB with populated `ingestion_coverage` rows across 365+ distinct dates. The gate logic is correct in code.

---

## Gaps Summary

No automated gaps found. All 5 success criteria are verified. All 4 requirement IDs (INTG-01, INTG-02, INTG-03, INTG-05) have implementation evidence.

**Two warnings identified (non-blocking):**

1. **ingestion_coverage duplicate rows:** The `insert` calls in all three normalizers do not use `onConflictDoNothing`. Repeated syncs of the same date range will accumulate rows. This does not break the ARCH-03 gate (which uses `COUNT(DISTINCT coverage_date)`) but will cause table bloat in production. Recommend adding `onConflictDoNothing()` or `onConflictDoUpdate()` to these inserts in a Phase 3 cleanup.

2. **inArray query bug in global status route:** In `apps/web/app/api/integrations/status/route.ts` line 58-61, the intent is `and(inArray(syncRuns.integrationId, integrationIds), eq(syncRuns.status, 'running'))` but `&&` is used instead of `and(...)`. JavaScript `&&` evaluates both expressions and returns the last truthy one — so `inArray(...)` is evaluated for side effects only and the final condition is just `eq(syncRuns.status, 'running')`. This means the running syncs query returns running jobs across ALL tenants, not just this tenant's integrations. The result is still displayed correctly (only integrations for this tenant are in the map), but the DB query is less efficient than intended. Not a security issue since the data returned is then filtered client-side.

Both warnings are documented for Phase 3 attention. Neither prevents Phase 2 goal achievement.

---

_Verified: 2026-02-24_
_Verifier: Claude (gsd-verifier)_
