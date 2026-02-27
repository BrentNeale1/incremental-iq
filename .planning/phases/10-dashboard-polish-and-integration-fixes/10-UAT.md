---
status: resolved
phase: 10-dashboard-polish-and-integration-fixes
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md
started: 2026-02-27T03:00:00Z
updated: 2026-02-27T04:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. DataPoints in Methodology Sidebar
expected: Open the insights page and select a campaign row. Open the Methodology Sidebar. The "Data Points" field should display a numeric value (e.g., 90, 365) — not "undefined" or blank. The page should load without any console errors (no saturationData.find TypeError).
result: pass

### 2. Market Filter on Insights Page
expected: Select a market from the AppHeader market dropdown. The insights page incrementality table should update to show only scores for campaigns in that market. Switching markets should immediately refresh the data (no stale cache from previous market).
result: issue
reported: "The stats in the top section update, but the campaigns dont"
severity: major

### 3. Empty Market State
expected: Select a market that has no incrementality data. Instead of an empty table or error, you should see a centered message: "No incrementality data for [Market Name] yet" in muted text.
result: skipped
reason: All markets have data — cannot test empty state

### 4. Health Page CSV Export
expected: Go to the Health page and trigger a CSV export. Open the downloaded file — every cell should contain readable primitive values (text, numbers, dates). No cell should contain "[object Object]". Null values should show an em-dash character.
result: pass

### 5. Seasonality Page CSV Export
expected: Go to the Seasonality page and trigger a CSV export. Open the downloaded file — columns like name, event_date, weeks_until, days_until should all be readable. No "[object Object]" cells. Null values should show an em-dash character.
result: pass

### 6. Forecast Chart with Real Data
expected: On the insights page, select a campaign that has sufficient historical data (30+ days). The Forecast chart should display: a solid line for actual historical revenue, a dashed line for Prophet forecast values, and a shaded confidence band around the forecast. The tooltip should show date, actual value, forecast value, and confidence interval range.
result: skipped
reason: Python analysis service (localhost:8000) not running — graceful degradation works correctly (shows empty state message, no crash)

### 7. Forecast Chart Empty States
expected: On the insights page with NO campaign selected, the forecast chart area should show "Select a campaign in the table below to view its forecast". Then select a campaign that has no forecast data — it should show "Forecast data not available for this campaign".
result: pass

## Summary

total: 7
passed: 4
issues: 1
pending: 0
skipped: 2

## Gaps

- truth: "Market filter applies to Campaign Drill-Down table — switching markets filters the campaign list"
  status: resolved
  reason: "User reported: The stats in the top section update, but the campaigns dont"
  severity: major
  test: 2
  root_cause: "DrillDownTable has its own useDrillData hook that fetches /api/dashboard/campaigns without passing marketId. The API route already supports marketId filtering (line 96, 186-191 in campaigns/route.ts), but DrillDownTable never receives or forwards selectedMarket. The page passes selectedMarket to useIncrementality (stats cards) but not to DrillDownTable."
  artifacts:
    - path: "apps/web/components/insights/DrillDownTable.tsx"
      issue: "useDrillData (line 84) does not accept or pass marketId param; queryKey missing marketId"
    - path: "apps/web/app/(dashboard)/insights/page.tsx"
      issue: "DrillDownTable rendered at line 275 without marketId prop"
    - path: "apps/web/app/api/dashboard/campaigns/route.ts"
      issue: "Already supports marketId filter (line 96) — no API change needed"
  missing:
    - "Add marketId prop to DrillDownTableProps and useDrillData"
    - "Pass selectedMarket from page.tsx to DrillDownTable"
    - "Include marketId in queryKey and URLSearchParams in useDrillData"
  debug_session: ""
