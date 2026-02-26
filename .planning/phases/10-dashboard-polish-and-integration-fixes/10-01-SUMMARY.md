---
phase: 10-dashboard-polish-and-integration-fixes
plan: "01"
subsystem: api, ui
tags: [incrementality, market-filter, export, csv, zustand, tanstack-query, drizzle]

# Dependency graph
requires:
  - phase: 09-dashboard-data-wiring-fixes
    provides: CampaignRow aligned to API, buildPlatformData revenue fix, useOutcomeMode wired at layout level
  - phase: 05-expanded-connectors-and-multi-market
    provides: marketId on incrementality_scores (STAT-05 scaffold), markets Zustand store
provides:
  - dataPoints field in incrementality API response (both campaign detail + overview modes)
  - marketId parameter support in useIncrementality hook (queryKey + fetch URL)
  - Market-filtered insights page via selectedMarket from Zustand passed to useIncrementality
  - Flat CSV export rows for health page (no [object Object] cells)
  - Flat CSV export rows for seasonality page (no [object Object] cells)
affects: [insights, health, seasonality, methodology-sidebar, export]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle numeric() returns string — parseInt/parseFloat at API response boundary"
    - "TanStack Query queryKey must include all filter params to prevent stale cache on filter change"
    - "Export flatten pattern: map nested objects to primitive-only records before setExportData"

key-files:
  created: []
  modified:
    - apps/web/app/api/dashboard/incrementality/route.ts
    - apps/web/lib/hooks/useIncrementality.ts
    - apps/web/app/(dashboard)/insights/page.tsx
    - apps/web/app/(dashboard)/health/page.tsx
    - apps/web/app/(dashboard)/seasonality/page.tsx

key-decisions:
  - "dataPoints uses parseInt(score.dataPoints, 10) ?? 0 — Drizzle numeric() returns string, same pattern as liftMean/confidence"
  - "marketId in queryKey array prevents TanStack Query from serving stale cached data when market selection changes"
  - "Flat export rows use em-dash (U+2014) for null/undefined values — consistent with CONTEXT.md locked decision"
  - "Empty market state shown only when: selectedMarket is set AND scores empty AND not loading — avoids flash during fetch"

patterns-established:
  - "API route already supported marketId filter — hook and page just needed to pass it through"
  - "Health/seasonality export flatten: pick only primitive fields, use ?? em-dash for optionals"

requirements-completed: [MRKT-04, RPRT-05]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 10 Plan 01: Dashboard Polish and Integration Fixes Summary

**dataPoints wired from DB through API to MethodologySidebar; market filter flows from AppHeader Zustand state to insights incrementality API; health and seasonality CSV exports produce flat primitive rows with em-dash for nulls**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T03:37:55Z
- **Completed:** 2026-02-26T03:40:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added `dataPoints` to `RawScoreRow`, `RawScoreWithCampaign`, and `IncrementalityDetail` interfaces; selected from DB in both campaign detail and overview query modes; mapped with `parseInt(score.dataPoints, 10) ?? 0` at API boundary — MethodologySidebar now shows numeric value instead of `undefined`
- Added optional `marketId` third parameter to `useIncrementality`; included in `queryKey` array to bust cache on market change; passed to URLSearchParams in `queryFn` — insights page now reads `selectedMarket` from Zustand and filters all incrementality scores to the selected market
- Added empty market state on insights page: when market is selected but API returns empty array, renders "No incrementality data for [Market Name] yet" centered message with muted-foreground text
- Health page `setExportData` now receives flat records (`platform`, `status`, `freshness`, `last_sync_status`, `is_stale`, `stale_since_hours`, `last_run_type`, `last_run_status`, `records_ingested`) with no nested objects
- Seasonality page `setExportData` now receives flat records (`name`, `event_date`, `weeks_until`, `days_until`, `window_before_days`, `window_after_days`, `is_user_defined`) with no nested objects

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dataPoints to incrementality API and wire market filter** - `e7af6e6` (feat) — pre-committed before plan execution
2. **Task 2: Flatten health and seasonality export data** - `01ed034` (fix)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `apps/web/app/api/dashboard/incrementality/route.ts` - Added dataPoints to interfaces and both select() calls; mapped with parseInt at response boundary
- `apps/web/lib/hooks/useIncrementality.ts` - Added marketId optional parameter, queryKey inclusion, URLSearchParams pass-through
- `apps/web/app/(dashboard)/insights/page.tsx` - Read selectedMarket + markets from Zustand; pass to useIncrementality; add empty market state JSX
- `apps/web/app/(dashboard)/health/page.tsx` - Flatten IntegrationSyncHistory items to primitive records before setExportData
- `apps/web/app/(dashboard)/seasonality/page.tsx` - Flatten SeasonalEvent items to primitive records before setExportData

## Decisions Made
- `dataPoints` uses `parseInt(score.dataPoints, 10) ?? 0` — Drizzle `numeric()` returns string, consistent with `liftMean` parseFloat pattern already used
- `marketId` included in queryKey array prevents TanStack Query from serving stale cached data when market selection changes (Pitfall 1 from RESEARCH.md)
- Flat export rows use em-dash (U+2014 as `\u2014`) for null/undefined values — consistent with CONTEXT.md locked decision
- Empty market state shown only when `selectedMarket && !scoresLoading && (!scores || scores.length === 0)` — avoids flash during initial fetch

## Deviations from Plan

None — plan executed exactly as written. Task 1 changes were already present in a pre-existing commit (`e7af6e6 feat(10-02): add forecast API route and useForecast hook`) made before this plan run, so those files were verified correct and not re-committed.

## Issues Encountered

Task 1 changes had already been applied in a prior commit (`e7af6e6`) that was labeled `feat(10-02)`. The changes were correct and matched the plan specification exactly. No re-work needed; proceeded directly to Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MRKT-04 closed: insights page now fully market-filtered via AppHeader selection
- RPRT-05 closed: health and seasonality CSV exports produce flat, human-readable rows with no [object Object] cells
- MethodologySidebar dataPoints bug fixed — numeric value from DB flows through API to UI
- Ready for Phase 10 Plan 02 if any additional dashboard polish tasks remain

---
*Phase: 10-dashboard-polish-and-integration-fixes*
*Completed: 2026-02-26*

## Self-Check: PASSED

All required files verified present and commits confirmed:
- FOUND: apps/web/app/api/dashboard/incrementality/route.ts
- FOUND: apps/web/lib/hooks/useIncrementality.ts
- FOUND: apps/web/app/(dashboard)/insights/page.tsx
- FOUND: apps/web/app/(dashboard)/health/page.tsx
- FOUND: apps/web/app/(dashboard)/seasonality/page.tsx
- FOUND: commit e7af6e6 (task 1 — already committed before plan run)
- FOUND: commit 01ed034 (task 2)
- FOUND: commit 8e398c8 (metadata)
