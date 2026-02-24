---
phase: 02-core-data-ingestion
plan: 05
subsystem: api
tags: [shopify, graphql, bulk-operations, jsonl-streaming, token-refresh, revenue-attribution, drizzle]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: PlatformConnector interface, ConnectorConfig types, withTenant RLS helper, campaign_metrics schema with directRevenue/directConversions columns
  - phase: 01-data-architecture
    provides: campaign_metrics table with dual attribution schema (ARCH-02), raw_api_pulls landing zone

provides:
  - ShopifyConnector implementing PlatformConnector with fetchMetrics (incremental) and fetchMetricsBulk (backfill)
  - Shopify normalizer aggregating orders into directRevenue + directConversions per date
  - fetchMetricsBulk: Bulk Operations API with line-by-line JSONL streaming (prevents OOM)
  - refreshTokenIfNeeded: handles Shopify Dec 2025 expiring offline token model (1hr access, 90-day refresh)
  - ensureSyntheticCampaign: per-tenant "shopify-revenue" campaign for Phase 2 revenue aggregation
  - processShopifySync: top-level orchestrator with incremental/bulk path selection (>30 days → bulk)
  - connectors/index.ts updated: all three platform connectors (meta, google_ads, shopify) registered

affects: [02-06-scheduler, 03-statistical-engine, 04-dashboard]

# Tech tracking
tech-stack:
  added:
    - "@shopify/shopify-api v11.x — GraphQL Admin API client with Session management"
    - "Node.js readline + https streaming — line-by-line JSONL parsing for bulk operation files"
    - "p-retry v6 — exponential backoff with AbortError for non-retryable token expiry"
  patterns:
    - "Shopify Session class instantiation required (not plain object) for GraphqlClient constructor"
    - "GraphQLClientResponse<T>.body for query() vs .data directly for request() — use query() for raw GraphQL strings"
    - "fetchMetricsBulk: submit mutation → poll with node(id) query → stream JSONL from url"
    - "Synthetic campaign per tenant for Phase 2 revenue aggregation (UTM attribution deferred to Phase 3/4)"
    - "Token refresh gate: tokenExpiresAt stored as epoch ms in credentials.metadata, refresh within 5-minute buffer"

key-files:
  created:
    - "packages/ingestion/src/connectors/shopify.ts — ShopifyConnector with incremental + bulk paths"
    - "packages/ingestion/src/normalizers/shopify.ts — Shopify normalizer with two-stage pipeline"
  modified:
    - "packages/ingestion/src/connectors/index.ts — registered ShopifyConnector for 'shopify' platform"

key-decisions:
  - "fetchMetricsBulk is Shopify-specific (not on PlatformConnector interface) — processShopifySync imports ShopifyConnector directly for bulk path"
  - "Bulk path threshold: >30 days uses Bulk Operations API (not 7 or 14 days) — Shopify leaky bucket (40 req/store) makes standard pagination impractical for large ranges"
  - "JSONL streaming via Node.js readline createInterface — avoids OOM on gigabyte-scale bulk operation files"
  - "Token expiry check uses epoch ms in metadata.tokenExpiresAt with 5-minute refresh buffer — 1-hour Shopify access token lifetime from Dec 2025"
  - "AbortError from p-retry used for non-retryable token expiry (401/400 status) — signals re-authorization required"
  - "shopMoney accessor for shop-default currency (not presentment currency) — v1 design, multi-currency normalization deferred to v2"
  - "directRoas left NULL at ingestion time — requires ad spend from Meta/Google, computed in Phase 3"
  - "Synthetic 'shopify-revenue' campaign externalId per tenant — per-campaign UTM attribution is Phase 3/4"

requirements-completed: [INTG-03]

# Metrics
duration: 9min
completed: 2026-02-24
---

# Phase 2 Plan 05: Shopify Connector and Revenue Normalizer Summary

**Shopify GraphQL connector with Bulk Operations backfill + order revenue aggregation into directRevenue/directConversions using per-tenant synthetic campaign**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T05:24:47Z
- **Completed:** 2026-02-24T05:33:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ShopifyConnector with dual sync paths: cursor-paginated GraphQL for incremental (≤30 days) and Bulk Operations API for backfill (>30 days)
- Line-by-line JSONL streaming for bulk operation files — prevents OOM on gigabyte-scale datasets from large Shopify stores
- Expiring offline token refresh (Shopify Dec 2025 change): 1-hour access token exchanged via refresh token, AbortError signals re-authorization when refresh token expired (>90 days)
- Shopify normalizer aggregates orders by date into directRevenue (sum) + directConversions (count) per date into campaign_metrics
- Per-tenant synthetic "shopify-revenue" campaign for Phase 2 revenue aggregation (UTM attribution deferred to Phase 3/4)
- connectors/index.ts now registers all three platform connectors: meta, google_ads, shopify

## Task Commits

Each task was committed atomically:

1. **Task 1: Shopify connector with bulk operations for backfill** - `bfffb9b` (feat)
2. **Task 2: Shopify normalizer mapping orders to direct attribution** - `b5cf5bb` (feat)

## Files Created/Modified
- `packages/ingestion/src/connectors/shopify.ts` — ShopifyConnector: fetchCampaigns (no-op), fetchMetrics (GraphQL pagination), fetchMetricsBulk (Bulk Operations + JSONL stream), refreshTokenIfNeeded (1hr token rotation)
- `packages/ingestion/src/normalizers/shopify.ts` — Two-stage pipeline: storeRawPull → normalizeShopifyOrders aggregating by date, ensureSyntheticCampaign, processShopifySync orchestrator
- `packages/ingestion/src/connectors/index.ts` — Updated to register ShopifyConnector for 'shopify' platform

## Decisions Made
- `fetchMetricsBulk` is Shopify-specific (not on PlatformConnector interface) — `processShopifySync` imports `ShopifyConnector` directly when day range > 30
- Bulk path threshold at 30 days (not 7 or 14) — Shopify standard GraphQL rate limits (40 req/store) make pagination impractical at longer ranges
- JSONL streaming via Node.js readline for bulk operation files — bulk JSONL can be gigabytes; streaming is mandatory to avoid OOM
- `shopMoney` accessor used for all amounts (shop's default currency, not presentment) — v1 design; multi-currency normalization is v2
- `directRoas` left NULL at ingestion — requires ad spend from Meta/Google, computed in Phase 3 statistical engine
- Synthetic 'shopify-revenue' campaign per tenant — per-campaign UTM attribution (Phase 3/4 concern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected GraphQL client API usage for @shopify/shopify-api v11**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Initial implementation used `.body.data` on `request()` response, but `GraphQLClientResponse<T>` has `.body` with `data` nested inside at `.body.data`. Additionally, `GraphqlClient` requires a proper `Session` class instance (not a plain object), and `Parameters<typeof this.shopify.clients.Graphql>[0]['session']` is not valid as a private method type
- **Fix:** Used `client.query<T>({ data: queryStr })` which returns `{ body: T }` — so `result.body.orders` is correct. Built `Session` instances via `new Session(params)` with `session.accessToken` set after construction. Used `InstanceType<ReturnType<typeof shopifyApi>['clients']['Graphql']>` type alias for private method parameter typing
- **Files modified:** packages/ingestion/src/connectors/shopify.ts
- **Verification:** `npx tsc --noEmit --skipLibCheck` — zero errors
- **Committed in:** bfffb9b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript circular inference in while loop with pRetry**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Variables declared inside `while (hasNextPage)` and captured by `pRetry` async function caused TS7022 circular type inference errors
- **Fix:** Added explicit `: string` and `: OrdersQueryData` type annotations to `cursorClause`, `queryStr`, `response` variables and added explicit return type `Promise<OrdersQueryData>` to pRetry callback
- **Files modified:** packages/ingestion/src/connectors/shopify.ts
- **Verification:** `npx tsc --noEmit --skipLibCheck` — zero errors
- **Committed in:** bfffb9b (Task 1 commit)

**3. [Rule 1 - Bug] Fixed pRetry v6 `shouldRetry` option (removed, doesn't exist)**
- **Found during:** Task 1 (plan review)
- **Issue:** Plan spec used `shouldRetry` option in pRetry, but p-retry v6 does not have this option. Non-retryable errors must be thrown as `AbortError`
- **Fix:** Used `throw new AbortError(message)` instead of `shouldRetry` predicate — AbortError prevents further retries and propagates the error
- **Files modified:** packages/ingestion/src/connectors/shopify.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** bfffb9b (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — correcting API usage to match actual library signatures)
**Impact on plan:** All fixes necessary for correctness. The Shopify SDK API differs slightly from what the plan assumed based on documentation; the fixes align the implementation with the actual v11.14.1 type signatures. No scope creep.

## Issues Encountered
- `@shopify/shopify-api` v11 `GraphqlClient.query()` and `request()` have different return shapes: `query()` returns `{ body: T }`, `request()` returns `GraphQLClientResponse<T>` which has `data?: T`. Used `query()` throughout since it accepts raw GraphQL strings. Verified against actual `.d.ts` type definitions.
- `Session` must be a proper class instance (not a plain object) — the `GraphqlClient` constructor validates the session parameter at runtime using class instance checks

## Next Phase Readiness
- All three platform connectors (meta, google_ads, shopify) are now implemented and registered
- Revenue data pipeline: Shopify orders → raw_api_pulls → campaign_metrics.directRevenue
- Plan 06 (scheduler) can now register BullMQ jobs for all three platforms including Shopify
- Phase 3 statistical engine will join directRevenue with Meta/Google spend columns to compute directRoas

---
*Phase: 02-core-data-ingestion*
*Completed: 2026-02-24*
