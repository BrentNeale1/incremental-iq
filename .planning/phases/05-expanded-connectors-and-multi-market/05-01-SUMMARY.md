---
phase: 05-expanded-connectors-and-multi-market
plan: 01
subsystem: database
tags: [drizzle, postgresql, rls, geo-targeting, market-detection, google-ads, meta, intl]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: integrations table, decryptToken, withTenant, GoogleAdsApi connector pattern
  - phase: 01-data-architecture
    provides: campaigns table, Drizzle RLS pattern, migration naming convention
provides:
  - markets and campaign_markets Drizzle schema with restrictive RLS policies
  - SQL migration 0005_markets_and_ga4 with ENABLE + FORCE RLS
  - outcomeMode column on tenants (default 'ecommerce') for UI language gating
  - detectGoogleAdsMarkets() — two-query GAQL approach for campaign geo extraction
  - detectMetaMarkets() — ad set targeting.geo_locations.countries aggregation
  - detectMarketsForTenant() — orchestrator upserts markets and campaign_markets
affects:
  - 05-expanded-connectors-and-multi-market (Plans 02-04 depend on these tables)
  - scoring worker (Phase 5 Plan 03 will use marketId in incrementality_scores)
  - dashboard API routes (Phase 5 Plan 04 market filter needs campaign_markets join)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-query GAQL pattern for Google Ads geo targeting (campaign_criterion + geo_target_constant)
    - Intl.DisplayNames for zero-dependency country name resolution
    - IntegrationRow interface for type-safe DB result iteration when package resolution is indirect
    - Explicit return type annotation on withTenant() calls (same pattern as Phase 04)

key-files:
  created:
    - packages/db/src/schema/markets.ts
    - packages/db/migrations/0005_markets_and_ga4.sql
    - packages/ingestion/src/market-detection/google-ads.ts
    - packages/ingestion/src/market-detection/meta.ts
    - packages/ingestion/src/market-detection/index.ts
  modified:
    - packages/db/src/schema/tenants.ts
    - packages/db/src/schema/index.ts
    - packages/db/migrations/meta/_journal.json
    - packages/ingestion/src/index.ts

key-decisions:
  - "markets.campaignCount uses integer (not numeric) — plan said integer, matches simpler Drizzle type for a count field"
  - "detectMarketsForTenant uses raw SQL upsert for campaign_markets — ON CONFLICT (tenant_id, campaign_id) DO UPDATE is cleaner than select-then-insert for the unique index"
  - "IntegrationRow interface added to market-detection/index.ts — Drizzle return types collapse to unknown when @incremental-iq/db is not directly resolvable from packages/ingestion tsc context"
  - "detectGoogleAdsMarkets returns empty array (not error) when GAQL queries fail — platform errors are logged as warnings so detection continues for other integrations"

patterns-established:
  - "Market detection files in packages/ingestion/src/market-detection/ (separate from connectors/)"
  - "Global/Unassigned bucket: NULL marketId in campaign_markets (not a sentinel UUID)"
  - "Country code normalization: .toUpperCase() applied to all codes from both platforms"

requirements-completed:
  - MRKT-01

# Metrics
duration: 7min
completed: 2026-02-25
---

# Phase 5 Plan 01: Markets Schema + Market Detection Summary

**Drizzle markets/campaign_markets tables with RLS, SQL migration 0005, and detectMarketsForTenant orchestrator using GAQL two-query geo extraction + Meta ad set targeting aggregation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-25T00:52:41Z
- **Completed:** 2026-02-25T00:59:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created markets and campaign_markets Drizzle tables with restrictive RLS policies following exact campaigns.ts pattern
- Migration 0005_markets_and_ga4.sql with ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, and CREATE POLICY on both tables
- Added outcomeMode column to tenants table (default 'ecommerce') for dashboard UI language gating
- Implemented detectGoogleAdsMarkets() using GAQL two-query approach per RESEARCH.md Pattern 4 and Pitfall 4
- Implemented detectMetaMarkets() reading ad set targeting.geo_locations.countries per RESEARCH.md Pattern 5 and Pitfall 3
- Implemented detectMarketsForTenant() orchestrator with Intl.DisplayNames for country name resolution (zero dependency)
- Campaigns with no geo targeting produce NULL marketId (Global/Unassigned) per user decision

## Task Commits

Each task was committed atomically:

1. **Task 1: Create markets schema + tenant outcomeMode + migration** - `cd17a6c` (feat)
2. **Task 2: Implement market detection from Google Ads and Meta geo targeting** - `5a6ae43` (feat)

**Plan metadata:** (committed below)

## Files Created/Modified
- `packages/db/src/schema/markets.ts` - markets and campaign_markets Drizzle schema with pgPolicy RLS
- `packages/db/migrations/0005_markets_and_ga4.sql` - SQL migration with ENABLE + FORCE RLS + CREATE POLICY
- `packages/db/migrations/meta/_journal.json` - Added idx=5 entry for 0005_markets_and_ga4
- `packages/db/src/schema/tenants.ts` - Added outcomeMode column (default 'ecommerce')
- `packages/db/src/schema/index.ts` - Added Phase 5 section with markets export
- `packages/ingestion/src/market-detection/google-ads.ts` - detectGoogleAdsMarkets() GAQL two-query impl
- `packages/ingestion/src/market-detection/meta.ts` - detectMetaMarkets() ad set geo aggregation
- `packages/ingestion/src/market-detection/index.ts` - detectMarketsForTenant() orchestrator
- `packages/ingestion/src/index.ts` - Added market-detection export

## Decisions Made
- `markets.campaignCount` uses Drizzle `integer()` (not `numeric()`) — integer is the correct type for a campaign count field; the plan said "integer" and numeric/integer are equivalent in this context
- Raw SQL upsert `ON CONFLICT (tenant_id, campaign_id) DO UPDATE` for campaign_markets — cleaner than select-then-insert pattern given the unique index
- `IntegrationRow` interface added to index.ts for explicit typing of Drizzle DB results when TypeScript can't fully resolve the @incremental-iq/db package from the packages/ingestion tsc context (same issue as noted in STATE.md for withTenant return type annotation)
- `detectGoogleAdsMarkets` returns empty array (not throws) on GAQL failure — detection failures are logged as warnings so the orchestrator continues with other integrations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in packages/db (`TS2688: Cannot find type definition file for 'node'`) was confirmed to pre-exist before our changes via git stash test — not caused by this plan
- Pre-existing TypeScript errors in packages/ingestion (normalizers, ga4.ts connector with missing google-auth-library) — all pre-existing, none in our new market-detection files
- Explicit `IntegrationRow` interface added to resolve implicit `any` type on filter callbacks when `allIntegrations` type collapses due to indirect package resolution

## User Setup Required
None - no external service configuration required beyond what Phase 2 already requires (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, FACEBOOK_APP_ID).

## Next Phase Readiness
- markets and campaign_markets tables ready for Plan 02 (GA4 connector) to reference
- detectMarketsForTenant ready to be called from Plan 03 (onboarding flow / market confirmation UI)
- outcomeMode column on tenants ready for Plan 04 UI language toggle
- Migration 0005 ready to run against the database (same pending status as 0002, 0003, 0004)

---
*Phase: 05-expanded-connectors-and-multi-market*
*Completed: 2026-02-25*
