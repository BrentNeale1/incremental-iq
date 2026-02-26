---
phase: 10-dashboard-polish-and-integration-fixes
plan: 02
subsystem: insights-chart
tags: [forecast, prophet, confidence-bands, recharts, tanstack-query]
dependency_graph:
  requires:
    - packages/analysis FastAPI /forecast endpoint (Python service)
    - apps/web/lib/hooks pattern (TanStack Query)
    - apps/web/components/insights/ConfidenceIntervalChart.tsx (stacked Area pattern reference)
  provides:
    - GET /api/dashboard/forecast route
    - useForecast(campaignId) hook
    - ForecastActualChart with real Prophet data and confidence bands
  affects:
    - apps/web/app/(dashboard)/insights/page.tsx (replaces scaffold forecastData useMemo)
tech_stack:
  added:
    - date-fns subDays (for 365-day cutoff calculation)
  patterns:
    - ComposedChart with stacked Area CI bands (same as ConfidenceIntervalChart)
    - TanStack Query with enabled guard and 10-min staleTime
    - Graceful degradation: empty arrays on Python service failure
key_files:
  created:
    - apps/web/app/api/dashboard/forecast/route.ts
    - apps/web/lib/hooks/useForecast.ts
  modified:
    - apps/web/components/insights/ForecastActualChart.tsx
    - apps/web/app/(dashboard)/insights/page.tsx
decisions:
  - Graceful degradation: forecast route returns empty arrays on any Python service error, not 5xx
  - Min 30 data points enforced before calling Python service (insufficient data returns empty)
  - ciBase+ciWidth stacked Area pattern matches ConfidenceIntervalChart.tsx exactly (dark-mode safe)
  - emptyMessage prop contextualizes empty state: different message when no row selected vs no data
  - forecastLoading uses Skeleton directly in page (not inside chart component) — matches SkeletonLoaders pattern
metrics:
  duration: "~12 min"
  completed: "2026-02-26"
  tasks: 2
  files: 4
---

# Phase 10 Plan 02: Forecast Chart Real Data Integration Summary

Prophet forecast integration replacing scaffold approximation with real yhat/confidence bands, graceful degradation, and context-aware empty states.

## What Was Built

**Task 1: Forecast API route and useForecast hook**

- `GET /api/dashboard/forecast` — session-authenticated Next.js API route
  - Accepts `campaignId` query parameter (required, returns 400 if missing)
  - Fetches last 365 days of campaign metrics from DB via `withTenant()`
  - Returns `{ historical: [], future: [], actuals: [] }` when fewer than 30 data points
  - POSTs to `${ANALYSIS_SERVICE_URL}/forecast` with tenant/campaign/metrics payload
  - Splits Prophet response into historical (date <= today) and future (date > today)
  - Returns actuals array with observed directRevenue values for the historical range
  - Full try/catch: any network error or non-200 from Python returns empty arrays
- `useForecast(campaignId)` — TanStack Query hook
  - `queryKey: ['forecast', campaignId]` — per-campaign cache isolation
  - `enabled: !!campaignId` — no fetch until campaign selected
  - `staleTime: 10 minutes` — forecast data is expensive to compute

**Task 2: ForecastActualChart upgrade and insights page wiring**

- `ForecastActualChart` — upgraded from `LineChart` to `ComposedChart`:
  - Updated `ForecastActualPoint` interface with `forecastLower`, `forecastUpper`, `ciBase`, `ciWidth`
  - `emptyMessage?: string` prop for context-aware empty states
  - Stacked Area CI band pattern: transparent `ciBase` + `ciWidth` at 0.15 opacity (dark-mode safe)
  - Solid `Line` for actual historical values (`hsl(var(--chart-1))`)
  - Dashed `Line` for Prophet forecast (`hsl(var(--chart-2))`, `strokeDasharray="5 3"`)
  - Tooltip shows date + actual + forecast + confidence interval range
- `insights/page.tsx` — wired real forecast data:
  - Replaced `forecastData` scaffold useMemo (liftMean * 1.08) with `useForecast(selectedRow?.id)`
  - `forecastChartData` useMemo merges historical/future/actuals into `ForecastActualPoint[]`
  - Historical: actual from actuals map + yhat + CI from historical array (date-matched)
  - Future: yhat + CI from future array (no actual value)
  - Loading state: `<Skeleton>` rendered in page while `forecastLoading` is true
  - Empty state when no row selected: "Select a campaign in the table below to view its forecast"
  - Empty state when no data: "Forecast data not available for this campaign"

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript compiles without errors in all created/modified files (verified with `npx tsc --noEmit --skipLibCheck`)
- Forecast API route has proper session auth, 400 on missing campaignId, graceful degradation
- ForecastActualChart uses ComposedChart with stacked Area CI bands matching ConfidenceIntervalChart pattern
- Insights page uses real useForecast hook, not liftMean * 1.08 scaffold
- Context-aware empty states: different messages for no-selection vs no-data conditions

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e7af6e6 | feat(10-02): add forecast API route and useForecast hook |
| 2 | e27ae01 | feat(10-02): upgrade ForecastActualChart with real Prophet data and confidence bands |

## Self-Check: PASSED

- forecast/route.ts: FOUND
- useForecast.ts: FOUND
- ForecastActualChart.tsx: FOUND
- 10-02-SUMMARY.md: FOUND
- Commit e7af6e6: FOUND
- Commit e27ae01: FOUND
- useForecast wired in page.tsx: CONFIRMED
- forecastLower in ForecastActualChart: CONFIRMED
- Scaffold (liftMean * 1.08) removed: CONFIRMED
