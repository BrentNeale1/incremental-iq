---
phase: 08-market-aware-recommendations
plan: 02
subsystem: frontend
tags: [tanstack-query, zustand, market-filtering, recommendation-cards, dashboard-ux]

# Dependency graph
requires:
  - phase: 08-01
    provides: Recommendation type with marketId/marketName/marketCountryCode fields
  - phase: 05-expanded-connectors-and-multi-market
    provides: markets table with campaignCount and displayName
  - phase: 04-recommendations-and-dashboard
    provides: useRecommendations hook, recommendation card components, dashboard page
provides:
  - Instant client-side market filtering via TanStack Query select (no re-fetch on market change)
  - Market badges on all three recommendation card types (executive, analyst, low-confidence)
  - Dashboard filter label showing active market and campaign count
  - Empty-market cross-market suggestions using queryClient cache
  - Stale-market graceful fallback with sonner toast notification
  - Low-data amber warning for markets with fewer than 5 campaigns
affects: [recommendation cards, dashboard UX, useRecommendations hook]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TanStack Query select for client-side filtering without changing queryKey (stable cache key)
    - queryClient.getQueryData to read cached data without triggering a new fetch
    - countryFlag helper inlined per-file (no shared util) — converts 2-letter code to flag emoji

key-files:
  created: []
  modified:
    - apps/web/lib/hooks/useRecommendations.ts
    - apps/web/components/recommendations/RecommendationCard.tsx
    - apps/web/components/recommendations/RecommendationAnalystCard.tsx
    - apps/web/components/recommendations/LowConfidenceCard.tsx
    - apps/web/app/(dashboard)/page.tsx

key-decisions:
  - "queryKey stays ['recommendations'] (no market in key) — client-side filtering via select avoids per-market network requests"
  - "countryFlag helper inlined in each card file (not shared util) — plan-specified approach for locality"
  - "CrossMarketSuggestions reads from queryClient.getQueryData(['recommendations']) — no extra fetch"
  - "Low-data threshold: 5 campaigns (per plan discretion note)"
  - "stale-market fallback fires only when markets.length > 0 (prevents false positive on initial load before markets are fetched)"

patterns-established:
  - "TanStack Query select pattern: filter derived data client-side without cache invalidation or queryKey changes"
  - "queryClient.getQueryData for inline component cache reads — avoid hook calls inside components that conditionally render"

requirements-completed: [MRKT-04]

# Metrics
duration: 4min
completed: 2026-02-26
---

# Phase 08 Plan 02: Market-Aware Recommendations — Client UI Summary

**TanStack Query select wired for instant client-side market filtering; market badges added to all card types; dashboard shows filter label, empty-market cross-market suggestions, stale-market toast fallback, and low-data amber warning**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-25T23:48:53Z
- **Completed:** 2026-02-25T23:52:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Wired `useRecommendations` with TanStack Query `select` option — subscribes to `useDashboardStore.selectedMarket`, filters cached data client-side instantly without re-fetching (stable `['recommendations']` queryKey preserved)
- Added `countryFlag` helper and market badge (flag + market name) to `RecommendationCard` and `RecommendationAnalystCard` — badge appears after platform badge in a flex row when `rec.marketName` is present
- Added market info to `LowConfidenceCard` subtitle — `platform · flag market · confidence` format
- Added stale-market `useEffect` to dashboard page — validates persisted `selectedMarket` against live markets list, calls `setSelectedMarket(null)` + `toast()` if market no longer exists
- Added filter label above Recommendations h2 — `"Filtered: {market} ({N} campaigns)"` when market is selected
- Added low-data amber warning — shown when `selectedMarketInfo.campaignCount < 5`
- Added empty-market UX — when `selectedMarket` set and `campaignRecs.length === 0`, shows explanatory note + `CrossMarketSuggestions` component
- `CrossMarketSuggestions` reads top 3 recs from TanStack Query cache via `queryClient.getQueryData(['recommendations'])` — no network request

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire useRecommendations with market filtering and add market badges to cards** — `b31e756` (feat)
2. **Task 2: Add filter label, empty-market UX, stale-market fallback, and low-data warning** — `ca5039c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/web/lib/hooks/useRecommendations.ts` — Added `useDashboardStore` import, `selectedMarket` subscription, and `select` option for client-side filtering
- `apps/web/components/recommendations/RecommendationCard.tsx` — Added `countryFlag` helper and market badge in flex row with platform badge
- `apps/web/components/recommendations/RecommendationAnalystCard.tsx` — Added `countryFlag` helper and market badge in flex row with platform badge
- `apps/web/components/recommendations/LowConfidenceCard.tsx` — Added `countryFlag` helper and market info in subtitle text
- `apps/web/app/(dashboard)/page.tsx` — Added `selectedMarket`/`markets`/`setSelectedMarket` store reads, stale-market `useEffect`, filter label, low-data warning, empty-market `CrossMarketSuggestions`, `toast` and `useQueryClient` imports

## Decisions Made

- `queryKey` stays `['recommendations']` (no market in key) — critical to avoid per-market re-fetches; client-side filtering only via `select`
- `countryFlag` helper inlined per-file per plan spec — avoids creating a shared util file for a simple 2-line function
- `CrossMarketSuggestions` reads from `queryClient.getQueryData` not a new `useQuery` — no extra fetch, uses already-cached full unfiltered set
- Stale-market effect guarded with `markets.length > 0` — prevents false positive fallback on initial render before markets API responds
- Low-data threshold: 5 campaigns (specified in plan as "per Claude's discretion, per RESEARCH.md Pitfall 6")

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in dev environment (`lucide-react`, `@tanstack/react-query`, `sonner`, `better-auth` missing npm types) — same pattern confirmed in 08-01 SUMMARY; none are in recommendation library files; all logic is correct
- Pre-existing implicit `any` TypeScript errors on Zustand store selector callbacks — same pattern exists across all dashboard pages; environmental issue, not a code defect

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 8 MRKT-04 is complete: server-side market filtering (08-01) + client-side market filtering UI (08-02)
- MarketSelector in AppHeader already wired to `selectedMarket` in Zustand store (Phase 5/7 work)
- Users can now select a market and instantly see filtered recommendations with market badges

## Self-Check: PASSED

- FOUND: apps/web/lib/hooks/useRecommendations.ts
- FOUND: apps/web/components/recommendations/RecommendationCard.tsx
- FOUND: apps/web/components/recommendations/RecommendationAnalystCard.tsx
- FOUND: apps/web/components/recommendations/LowConfidenceCard.tsx
- FOUND: apps/web/app/(dashboard)/page.tsx
- FOUND: .planning/phases/08-market-aware-recommendations/08-02-SUMMARY.md
- COMMIT b31e756: verified in git log
- COMMIT ca5039c: verified in git log

---
*Phase: 08-market-aware-recommendations*
*Completed: 2026-02-26*
