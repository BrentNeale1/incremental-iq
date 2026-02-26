---
phase: 09-dashboard-data-wiring-fixes
plan: 01
subsystem: ui
tags: [react, zustand, recharts, tanstack-query, typescript]

# Dependency graph
requires:
  - phase: 07-onboarding-and-connect
    provides: useOutcomeMode hook and tenant preferences API
  - phase: 04-recommendations-and-dashboard
    provides: dashboard components, Zustand store, campaign API route
provides:
  - CampaignRow interface aligned to actual API response (revenue field, not directRevenue)
  - buildPlatformData reads row.revenue, derives incrementalRevenue via revenue * liftMean
  - useOutcomeMode wired at layout level to populate Zustand outcomeMode state
  - KpiCard dynamic METRIC_LABELS based on outcomeMode (lead_gen vs ecommerce)
  - PlatformComparisonChart dynamic chartConfig labels and Bar names based on outcomeMode
  - IncrementalRevenueChart dynamic chart label based on outcomeMode
affects:
  - dashboard UI components
  - lead_gen tenant terminology

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fetch tenant config at layout level (useOutcomeMode alongside useMarkets), read from Zustand in leaf components — no prop drilling"
    - "Move module-scope chartConfig/METRIC_LABELS into component function body when dynamic labels needed"
    - "Derive incrementalRevenue as revenue * liftMean at aggregation time (v1 approximation)"

key-files:
  created: []
  modified:
    - apps/web/lib/hooks/useCampaigns.ts
    - apps/web/app/(dashboard)/page.tsx
    - apps/web/components/layout/DashboardLayoutClient.tsx
    - apps/web/components/dashboard/KpiCard.tsx
    - apps/web/components/charts/PlatformComparisonChart.tsx
    - apps/web/components/charts/IncrementalRevenueChart.tsx

key-decisions:
  - "CampaignRow interface aligned to API: single revenue field replaces directRevenue + modeledRevenue (API never had those fields)"
  - "incrementalRevenue derived as revenue * liftMean in buildPlatformData — v1 approximation, avoids API/DB changes"
  - "IncrementalRevenueChart also updated with dynamic label (same pattern as PlatformComparisonChart)"

patterns-established:
  - "Layout-level data fetching pattern: useOutcomeMode(tenantId) in DashboardLayoutClient populates Zustand; leaf components read store directly"
  - "Dynamic chart config pattern: move ChartConfig to component body and gate labels on outcomeMode"

requirements-completed: [RPRT-01, RPRT-07]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 9 Plan 01: Dashboard Data Wiring Fixes Summary

**CampaignRow type realigned to API (revenue not directRevenue), platform chart now shows real revenue values, and lead_gen tenants see Leads/Cost per Lead/Incremental Leads terminology across all KPI cards and charts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T01:55:32Z
- **Completed:** 2026-02-26T01:58:45Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed zero-revenue platform chart: CampaignRow had `directRevenue`/`modeledRevenue` fields that never existed in API response; replaced with `revenue: number` matching actual API JSON
- Fixed buildPlatformData to read `row.revenue` and derive `incrementalRevenue` as `revenue * liftMean` (v1 approximation with code comment)
- Wired `useOutcomeMode(tenantId)` in DashboardLayoutClient alongside existing `useMarkets(tenantId)` — outcomeMode now populates Zustand store on dashboard load
- Made KpiCard METRIC_LABELS dynamic (revenue/roas/incremental_revenue labels switch between ecommerce and lead_gen terminology)
- Made PlatformComparisonChart chartConfig labels and Bar name props dynamic based on outcomeMode
- Made IncrementalRevenueChart chartConfig value label dynamic (also had hardcoded "Incremental Revenue")

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix CampaignRow type mismatch and buildPlatformData zero-revenue bug** - `982f76e` (fix)
2. **Task 2: Wire useOutcomeMode hook and make KPI/chart labels dynamic** - `6be5c3c` (fix)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `apps/web/lib/hooks/useCampaigns.ts` - CampaignRow interface realigned to API response fields
- `apps/web/app/(dashboard)/page.tsx` - buildPlatformData reads row.revenue, derives incrementalRevenue
- `apps/web/components/layout/DashboardLayoutClient.tsx` - Added useOutcomeMode(tenantId) call
- `apps/web/components/dashboard/KpiCard.tsx` - Dynamic METRIC_LABELS based on outcomeMode from Zustand
- `apps/web/components/charts/PlatformComparisonChart.tsx` - Dynamic chartConfig labels and Bar names
- `apps/web/components/charts/IncrementalRevenueChart.tsx` - Dynamic chart label based on outcomeMode

## Decisions Made
- CampaignRow interface simplified: removed `directRevenue`, `modeledRevenue`, `incrementalRevenue`, `liftPct`, `campaignId`, `campaignName` (old snake_case fields); replaced with exact API response fields including `id`, `name`, `funnelStage`, `liftMean`, `liftLower`, `liftUpper`, `confidence`, `status`, `isRollup`
- incrementalRevenue derived as `revenue * liftMean` at buildPlatformData aggregation — avoids API/DB changes while providing meaningful chart values
- IncrementalRevenueChart updated with same dynamic label pattern (plan said "check first" — it did have hardcoded label, so applied same fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Applied dynamic label fix to IncrementalRevenueChart**
- **Found during:** Task 2 (checking IncrementalRevenueChart per plan instruction)
- **Issue:** Plan said "Do NOT touch IncrementalRevenueChart unless it also has hardcoded 'Revenue' labels (check first — if it does, apply same pattern)". The chart had `label: 'Incremental Revenue'` hardcoded in module-scope chartConfig.
- **Fix:** Moved chartConfig inside component function, added `useDashboardStore` import, made value label dynamic based on outcomeMode
- **Files modified:** apps/web/components/charts/IncrementalRevenueChart.tsx
- **Verification:** No TypeScript errors, consistent pattern with PlatformComparisonChart
- **Committed in:** 6be5c3c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — plan explicitly instructed to check and apply)
**Impact on plan:** Fix was within plan scope (plan explicitly said to apply if found). No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated files (signup/actions.ts, markets/route.ts, email templates, packages/ingestion scoring files) — documented in deferred-items.md, not fixed (out of scope per deviation rules)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Platform comparison chart now displays real revenue values instead of zeros for all platforms
- Lead_gen tenants will see correct terminology (Leads, Cost per Lead, Incremental Leads) across KPI cards and all charts
- Ecommerce tenants unaffected (default outcomeMode is 'ecommerce')
- Phase 09 Plan 01 complete — all dashboard data wiring bugs fixed

---
*Phase: 09-dashboard-data-wiring-fixes*
*Completed: 2026-02-26*
