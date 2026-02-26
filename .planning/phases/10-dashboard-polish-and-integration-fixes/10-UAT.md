---
status: diagnosed
phase: 10-dashboard-polish-and-integration-fixes
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md
started: 2026-02-26T04:00:00Z
updated: 2026-02-26T04:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. DataPoints in Methodology Sidebar
expected: Open the insights page and select a campaign row. Open the Methodology Sidebar. The "Data Points" field should display a numeric value (e.g., 90, 365) — not "undefined" or blank.
result: issue
reported: "Console Error — A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. Runtime TypeError: saturationData.find is not a function"
severity: blocker

### 2. Market Filter on Insights Page
expected: Select a market from the AppHeader market dropdown. The insights page incrementality table should update to show only scores for campaigns in that market. Switching markets should immediately refresh the data (no stale cache from previous market).
result: pass

### 3. Empty Market State
expected: Select a market that has no incrementality data. Instead of an empty table or error, you should see a centered message: "No incrementality data for [Market Name] yet" in muted text.
result: pass

### 4. Health Page CSV Export
expected: Go to the Health page and trigger a CSV export. Open the downloaded file — every cell should contain readable primitive values (text, numbers, dates). No cell should contain "[object Object]". Null values should show an em-dash character.
result: pass

### 5. Seasonality Page CSV Export
expected: Go to the Seasonality page and trigger a CSV export. Open the downloaded file — columns like name, event_date, weeks_until, days_until should all be readable. No "[object Object]" cells. Null values should show an em-dash character.
result: pass

### 6. Forecast Chart with Real Data
expected: On the insights page, select a campaign that has sufficient historical data (30+ days). The Forecast chart should display: a solid line for actual historical revenue, a dashed line for Prophet forecast values, and a shaded confidence band around the forecast. The tooltip should show date, actual value, forecast value, and confidence interval range.
result: issue
reported: "Runtime TypeError: saturationData.find is not a function at page.tsx line 76 — saturationData is not an array when .find() is called"
severity: blocker

### 7. Forecast Chart Empty States
expected: On the insights page with NO campaign selected, the forecast chart area should show "Select a campaign in the table below to view its forecast". Then select a campaign that has no forecast data — it should show "Forecast data not available for this campaign".
result: skipped
reason: saturationData.find blocker error prevents reliable testing of forecast empty states

## Summary

total: 7
passed: 4
issues: 2
pending: 0
skipped: 1

## Gaps

- truth: "Insights page loads without errors; DataPoints displays numeric value in Methodology Sidebar"
  status: failed
  reason: "User reported: Console Error — A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. Runtime TypeError: saturationData.find is not a function"
  severity: blocker
  test: 1
  root_cause: "useSaturation hook returns SaturationDetailResponse object (not array) when called with campaignId. The API route has two modes: overview returns SaturationRow[], detail returns {campaign, curvePoints, currentSpendLevel}. Hook type-asserts response as SaturationCurve[] regardless of mode. Guard !saturationData passes (objects are truthy), then .find() fails on the plain object."
  artifacts:
    - path: "apps/web/lib/hooks/useSaturation.ts"
      issue: "Type assertion always casts response as SaturationCurve[] — doesn't account for detail-mode object response"
    - path: "apps/web/app/(dashboard)/insights/page.tsx"
      issue: "Line 76 calls .find() on saturationData assuming it's always an array"
    - path: "apps/web/app/api/dashboard/saturation/route.ts"
      issue: "Returns SaturationRow[] | SaturationDetailResponse depending on campaignId param"
  missing:
    - "Fix useSaturation hook to handle both response shapes, or add Array.isArray guard in page.tsx"
  debug_session: ".planning/debug/saturation-find-not-function.md"

- truth: "Forecast chart displays real Prophet data with confidence bands when campaign selected"
  status: failed
  reason: "User reported: Runtime TypeError: saturationData.find is not a function at page.tsx line 76 — same root cause as test 1"
  severity: blocker
  test: 6
  root_cause: "Same as test 1 — saturationData.find TypeError blocks the entire insights page render"
  artifacts:
    - path: "apps/web/lib/hooks/useSaturation.ts"
      issue: "Same root cause as test 1"
  missing:
    - "Fixing test 1 root cause will unblock this test"
  debug_session: ".planning/debug/saturation-find-not-function.md"
