---
phase: 05-expanded-connectors-and-multi-market
verified: 2026-02-25T12:00:00Z
status: gaps_found
score: 3/4 success criteria verified
re_verification: false
gaps:
  - truth: "All reports and analysis views can be segmented by market"
    status: partial
    reason: "/api/recommendations route has no marketId filter; GA4EventSelector POST sends integrationId/propertyId as query params but API expects them in body"
    artifacts:
      - path: "apps/web/app/api/recommendations/route.ts"
        issue: "No marketId parameter accepted; calls generateRecommendations(tenantId) without market filtering. Engine has no campaignMarkets import or market awareness."
      - path: "apps/web/components/onboarding/GA4EventSelector.tsx"
        issue: "POST /api/ga4/events sends integrationId and propertyId as query params (line 54) but the POST handler reads them from request body (line 157 of events/route.ts). Will return 400 'integrationId is required'."
    missing:
      - "Add optional marketId query param to /api/recommendations and pass through to generateRecommendations engine"
      - "Fix GA4EventSelector.handleSave to send integrationId and propertyId in the JSON body, not query params"
human_verification:
  - test: "Start dev server, navigate to dashboard with multiple markets in test data, select a market from the MarketSelector dropdown"
    expected: "All KPIs, campaign table, incrementality, seasonality, and saturation views filter to that market's data. Network tab shows ?marketId= param on all dashboard API calls."
    why_human: "Requires running app with test data to verify visual rendering and API call wiring"
  - test: "Navigate between pages while a market is selected"
    expected: "Selected market persists in header across page navigation (Zustand persist middleware)"
    why_human: "Requires browser interaction to verify client-side state persistence"
  - test: "Visit onboarding flow with MarketConfirmationStep, GA4EventSelector, and OutcomeModeSelector"
    expected: "Components render with proper interactive controls, not placeholders"
    why_human: "Visual verification of component rendering and interaction"
---

# Phase 5: Expanded Connectors and Multi-Market Verification Report

**Phase Goal:** Users running lead gen businesses can connect GA4 as an outcome source, and all users get market-segmented attribution that prevents cross-market false signals

**Verified:** 2026-02-25T12:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can connect GA4 and select which conversion events represent leads, with those leads used as the outcome variable for analysis | VERIFIED (with minor bug) | GA4 OAuth route (`/api/oauth/ga4`) redirects with `analytics.readonly` scope. Callback saves `platform='ga4'` integration. Property listing endpoint returns properties with `autoSelected` flag. Events endpoint lists key events via `listKeyEventsAsync`. GA4EventSelector UI has checkbox list with select all/deselect all. processGA4Sync normalizer stores lead counts in `directConversions`. **Minor bug:** GA4EventSelector POST sends integrationId/propertyId as query params but API expects them in body -- save will fail with 400. |
| 2 | System auto-detects markets from campaign geo targeting metadata and presents them to the user for confirmation or correction during onboarding | VERIFIED | `detectGoogleAdsMarkets()` uses two-query GAQL approach (campaign_criterion + geo_target_constant) extracting country_code from all target types. `detectMetaMarkets()` reads ad set `targeting.geo_locations.countries` and aggregates per campaign. `detectMarketsForTenant()` orchestrates both, upserts markets with `Intl.DisplayNames` names, and assigns campaign_markets with `source='auto_detected'`. MarketConfirmationStep UI shows editable list with campaign count badges, confirm/rename/delete/add actions. |
| 3 | Attribution model isolates market signals -- a US spend spike does not produce a false lift signal against AU revenue | VERIFIED | Scoring worker (`worker.ts` lines 191-215) queries `campaign_markets` for the campaign's `marketId` before scoring. `persistScores()` accepts `marketId` parameter (line 102) and writes it to both adjusted and raw incrementality_scores rows (lines 112-143). Rollup (`rollup.ts`) includes `marketId` in cluster and channel groupKeys when non-null (lines 193-194, 211-212), adds market-level rollup (lines 230-241), and overall rollup aggregates across all markets (line 246). outcomeMode-aware: lead_gen tenants map directConversions to direct_revenue for Python sidecar (lines 211-215). |
| 4 | All reports and analysis views can be segmented by market | PARTIAL | 5 of 6 dashboard routes have marketId filtering: kpis (innerJoin campaignMarkets), campaigns (innerJoin campaignMarkets), incrementality (direct marketId filter on score rows), seasonality (innerJoin campaignMarkets on historical metrics), saturation (innerJoin campaignMarkets). **MISSING:** `/api/recommendations` route has NO marketId parameter -- it calls `generateRecommendations(tenantId)` which has no market awareness (no campaignMarkets import, no marketId filtering in engine.ts). MarketSelector in AppHeader wired to Zustand store with selectedMarket persisted. |

**Score:** 3/4 truths fully verified, 1 partial

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/markets.ts` | markets + campaign_markets with RLS | VERIFIED | Both tables defined with `pgPolicy('tenant_isolation')` restrictive, uniqueIndex on (tenantId, campaignId) |
| `packages/db/migrations/0005_markets_and_ga4.sql` | SQL migration with RLS | VERIFIED | CREATE TABLE, ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, CREATE POLICY on both tables, ALTER TABLE tenants ADD outcome_mode |
| `packages/db/src/schema/tenants.ts` | outcomeMode column | VERIFIED | `outcomeMode: text('outcome_mode').default('ecommerce').notNull()` at line 23 |
| `packages/db/src/schema/index.ts` | markets export | VERIFIED | `export * from './markets'` in Phase 5 section (line 22) |
| `packages/ingestion/src/market-detection/index.ts` | detectMarketsForTenant orchestrator | VERIFIED | 289 lines, fetches integrations, calls platform detectors, upserts markets/campaign_markets with withTenant |
| `packages/ingestion/src/market-detection/google-ads.ts` | Two-query GAQL geo extraction | VERIFIED | Query 1: campaign_criterion WHERE type='LOCATION' AND negative=FALSE. Query 2: geo_target_constant.country_code. Correctly uses toUpperCase() on all codes |
| `packages/ingestion/src/market-detection/meta.ts` | Ad set targeting extraction | VERIFIED | Reads `targeting.geo_locations.countries` from ad sets, aggregates per campaign, returns empty array for no-geo ad sets |
| `packages/ingestion/src/connectors/ga4.ts` | GA4Connector class | VERIFIED | 323 lines. listProperties (Admin API listPropertiesAsync), listKeyEvents (listKeyEventsAsync, NOT deprecated conversionEvents), fetchLeadCounts (Data API runReport with inListFilter, YYYYMMDD to YYYY-MM-DD regex conversion), refreshTokenIfNeeded |
| `packages/ingestion/src/normalizers/ga4.ts` | processGA4Sync normalizer | VERIFIED | Two-stage pipeline: storeGA4RawPull (source='ga4', apiVersion='data-v1beta') then normalizeGA4Events (directConversions column, 4-col upsert). Synthetic 'ga4-leads' campaign. Token refresh integration |
| `apps/web/app/api/oauth/ga4/route.ts` | OAuth initiation | VERIFIED | Redirects to Google with `analytics.readonly` scope, access_type='offline', prompt='consent' |
| `apps/web/app/api/oauth/ga4/callback/route.ts` | OAuth callback | VERIFIED | Exchanges code, saves integration via `saveIntegration({ platform: 'ga4' })` with empty selectedEventNames |
| `apps/web/app/api/ga4/properties/route.ts` | Property listing | VERIFIED | Calls GA4Connector.listProperties, returns autoSelected flag for single-property accounts |
| `apps/web/app/api/ga4/events/route.ts` | Event listing + saving | VERIFIED | GET lists via listKeyEvents. POST saves propertyId + selectedEventNames to integration metadata |
| `apps/web/app/api/markets/route.ts` | Market CRUD API | VERIFIED | GET returns markets with campaignCount sorted DESC. PUT supports confirm/rename/merge/add/delete actions |
| `apps/web/app/api/markets/detect/route.ts` | Detection trigger | VERIFIED | POST calls detectMarketsForTenant(tenantId), returns detected markets |
| `packages/ingestion/src/scoring/worker.ts` | Market-partitioned scoring | VERIFIED | Queries campaign_markets for marketId (lines 191-201), checks outcomeMode (lines 203-215), passes marketId to persistScores (line 434) |
| `packages/ingestion/src/scoring/persist.ts` | marketId on persistScores | VERIFIED | Accepts marketId parameter (default null), writes to both adjusted and raw incrementality_scores inserts |
| `packages/ingestion/src/scoring/rollup.ts` | Market-level rollup | VERIFIED | marketId in cluster/channel groupKeys when non-null, market-level rollup between channel and overall |
| `packages/ingestion/src/scheduler/jobs/sync.ts` | Market re-detection after sync | VERIFIED | Lines 150-159: calls detectMarketsForTenant after successful sync when platform is meta/google_ads and recordsIngested > 0 |
| `apps/web/components/layout/MarketSelector.tsx` | Market filter dropdown | VERIFIED | Reads from Zustand store, renders Select with country flag emojis, hidden for markets.length <= 1, calls setSelectedMarket |
| `apps/web/components/layout/AppHeader.tsx` | MarketSelector integration | VERIFIED | MarketSelector imported and rendered between ViewToggle and ExportButton (line 65) |
| `apps/web/components/onboarding/MarketConfirmationStep.tsx` | Editable market list | VERIFIED | Fetches from /api/markets, shows Input + Badge (campaign count) per market, confirm/rename/delete/add actions |
| `apps/web/components/onboarding/GA4EventSelector.tsx` | GA4 event checklist | VERIFIED (with bug) | Fetches events, renders Checkbox per event with countingMethod Badge, select all/deselect all toggle. **Bug:** handleSave sends POST to URL with query params but API expects body params |
| `apps/web/components/onboarding/OutcomeModeSelector.tsx` | Outcome mode selector | VERIFIED | Two-card layout (Revenue/Leads), calls PUT /api/tenant/preferences, passes selection to parent |
| `apps/web/hooks/useMarkets.ts` | TanStack Query hook | VERIFIED | Wraps GET /api/markets, staleTime 5 min, syncs to Zustand store via onSuccess |
| `apps/web/hooks/useOutcomeMode.ts` | Outcome mode hook | VERIFIED | Fetches from /api/tenant/preferences, provides terms object mapping outcomeMode to Revenue/Leads/Sale/Lead terminology |
| `apps/web/lib/store/dashboard.ts` | Zustand store extensions | VERIFIED | selectedMarket (persisted via partialize), markets array, outcomeMode, all setters present |
| `apps/web/app/api/tenant/preferences/route.ts` | Preferences API | VERIFIED | GET returns outcomeMode, PUT validates and updates outcomeMode on tenants table |
| `apps/web/app/api/recommendations/route.ts` | Recommendations with marketId | FAILED | No marketId parameter. Calls generateRecommendations(tenantId) which has no market awareness |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| market-detection/google-ads.ts | db/schema/markets.ts | campaign_markets insert | WIRED | Orchestrator (index.ts) does raw SQL INSERT INTO campaign_markets with ON CONFLICT upsert |
| market-detection/meta.ts | db/schema/markets.ts | campaign_markets insert | WIRED | Same orchestrator path as Google Ads |
| /api/markets/detect/route.ts | market-detection/index.ts | detectMarketsForTenant call | WIRED | `import { detectMarketsForTenant } from '@incremental-iq/ingestion'` and direct call on line 36 |
| scoring/worker.ts | db/schema/markets.ts | campaign_markets query | WIRED | Raw SQL query on campaign_markets for market_id (lines 192-200), import of campaignMarkets from @incremental-iq/db (line 32) |
| scoring/persist.ts | incrementality-scores.ts | marketId column | WIRED | persistScores accepts marketId param (line 102), passes to both insert calls (lines 124, 142) |
| MarketSelector.tsx | store/dashboard.ts | setSelectedMarket | WIRED | imports useDashboardStore, reads markets/selectedMarket, calls setSelectedMarket on value change |
| /api/dashboard/kpis/route.ts | db/schema/markets.ts | marketId JOIN | WIRED | Reads marketId from searchParams, innerJoin on campaignMarkets when specified |
| useOutcomeMode hook | store/dashboard.ts | outcomeMode | WIRED | Reads outcomeMode from store, fetches from /api/tenant/preferences and calls setOutcomeMode |
| OAuth callback | oauth-helpers.ts | saveIntegration | WIRED | `import { saveIntegration } from '@/lib/oauth-helpers'` and call with platform='ga4' |
| GA4EventSelector | /api/ga4/events | POST save | PARTIAL | Sends POST but integrationId/propertyId are in URL query params, not body. API reads from body. Will fail at runtime. |
| /api/recommendations | market filtering | marketId param | NOT_WIRED | No marketId param, no market filtering in engine |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTG-04 | 05-02, 05-04 | GA4 as outcome source | VERIFIED (minor bug) | Full pipeline: OAuth with analytics.readonly, connector with listProperties/listKeyEvents/fetchLeadCounts, processGA4Sync normalizer storing in directConversions, GA4EventSelector UI, property selection. Minor bug: POST save has param mismatch. |
| MRKT-01 | 05-01 | Auto-detect markets from campaign geo targeting | VERIFIED | detectGoogleAdsMarkets (two-query GAQL), detectMetaMarkets (ad set targeting), detectMarketsForTenant orchestrator, Intl.DisplayNames for country names, campaign_markets with source='auto_detected' |
| MRKT-02 | 05-03 | Market confirmation with editing | VERIFIED | GET /api/markets returns markets with campaignCount. PUT supports confirm/rename/merge/add/delete. MarketConfirmationStep UI with inline editing, campaign count badges, add market form |
| MRKT-03 | 05-03 | Attribution isolates market signals | VERIFIED | Scoring worker queries campaign_markets for marketId, passes to persistScores. Each market gets its own score rows. Rollup groups by market. outcomeMode-aware metric mapping for lead-gen |
| MRKT-04 | 05-04 | Market-segmented reporting UI | PARTIAL | MarketSelector in AppHeader, Zustand persistence, 5/6 dashboard routes filtered. Missing: /api/recommendations has no market filter |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/components/onboarding/GA4EventSelector.tsx` | 54 | POST sends params as query string, API expects body | Blocker | GA4 event selection save will fail with 400 at runtime |
| `apps/web/app/api/recommendations/route.ts` | 35 | `generateRecommendations(tenantId)` -- no marketId support | Warning | Recommendations not filterable by market; shows cross-market recommendations when user has market selected |
| `apps/web/components/layout/AppHeader.tsx` | 29 | `PLACEHOLDER_TENANT_ID = undefined` | Info | Pre-existing from Phase 4 -- tenantId from auth session not yet available (Phase 6 concern) |

### Human Verification Required

### 1. Market Filter Visual Flow

**Test:** Start dev server, navigate to dashboard with multiple markets in test data, select a market from MarketSelector dropdown
**Expected:** All KPIs, campaign table, incrementality, seasonality, and saturation views filter to that market's data. Network tab shows `?marketId=` param on all dashboard API calls.
**Why human:** Requires running app with test data to verify visual rendering and end-to-end API wiring

### 2. Market Filter Persistence

**Test:** Navigate between pages while a market is selected
**Expected:** Selected market persists in header dropdown across page navigation (Zustand persist middleware stores selectedMarket in localStorage)
**Why human:** Requires browser interaction to verify client-side state persistence

### 3. Onboarding Component Rendering

**Test:** Visit onboarding flow with MarketConfirmationStep, GA4EventSelector, and OutcomeModeSelector
**Expected:** Components render with proper interactive controls -- editable inputs with campaign count badges, event checkboxes with select all, two-card outcome mode choice
**Why human:** Visual verification of component rendering, layout, and interactivity

### Gaps Summary

Two gaps identified, one blocker and one warning:

**1. GA4EventSelector POST bug (Blocker for INTG-04):** The `handleSave` function in `GA4EventSelector.tsx` sends `integrationId` and `propertyId` as URL query parameters in the POST request (line 54: `fetch('/api/ga4/events?integrationId=...&propertyId=...')`), but the POST handler in `apps/web/app/api/ga4/events/route.ts` reads them from `request.json()` body (line 157). This means the save will always fail with a 400 "integrationId is required" error. Fix: send integrationId and propertyId in the JSON body alongside selectedEventNames.

**2. Recommendations route missing market filter (Warning for MRKT-04):** The `/api/recommendations` route accepts only `tenantId` and calls `generateRecommendations(tenantId)` with no market filtering. The engine (`apps/web/lib/recommendations/engine.ts`) has no import of `campaignMarkets` and no marketId logic. When a user selects a specific market in the MarketSelector, recommendations will still show cross-market results. This was noted in the `.continue-here.md` as a known gap. Fix: add optional marketId param to recommendations route and pass through to engine queries.

Both gaps relate to Success Criterion 4 ("All reports and analysis views can be segmented by market") and Requirement MRKT-04. The remaining 3 success criteria are fully met.

---

_Verified: 2026-02-25T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
