---
status: complete
phase: 10-dashboard-polish-and-integration-fixes
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md
started: 2026-02-27T05:00:00Z
updated: 2026-02-27T06:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. DataPoints in Methodology Sidebar
expected: Open the insights page and select a campaign row. Open the Methodology Sidebar. The "Data Points" field should display a numeric value (e.g., 90, 365) — not "undefined" or blank. No console errors.
result: pass

### 2. Market Filter on Insights Page (Stats + Campaigns)
expected: Select a market from the AppHeader market dropdown. Both the stats cards at the top AND the campaign drill-down table below should update to show only data for that market. Switching markets should refresh both sections immediately.
result: pass

### 3. Empty Market State
expected: Select a market that has no incrementality data. Instead of an empty table or error, you should see a centered message: "No incrementality data for [Market Name] yet" in muted text.
result: skipped
reason: All seeded markets have data — no empty market to test

### 4. Health Page CSV Export
expected: Go to the Health page and trigger a CSV export. Open the downloaded file — every cell should contain readable primitive values (text, numbers, dates). No cell should contain "[object Object]". Null values should show an em-dash character.
result: pass

### 5. Seasonality Page CSV Export
expected: Go to the Seasonality page and trigger a CSV export. Open the downloaded file — columns like name, event_date, weeks_until, days_until should all be readable. No "[object Object]" cells. Null values should show an em-dash character.
result: pass

### 6. Forecast Chart with Real Data
expected: On the insights page, select a campaign that has sufficient historical data (30+ days). The Forecast chart should display: a solid line for actual historical revenue, a dashed line for Prophet forecast values, and a shaded confidence band around the forecast. The tooltip should show date, actual value, forecast value, and confidence interval range.
result: skipped
reason: Python analysis service (Prophet) not running locally — API gracefully degrades to empty response, which is correct behavior

### 7. Forecast Chart Empty States
expected: On the insights page with NO campaign selected, the forecast chart area should show "Select a campaign in the table below to view its forecast". Then select a campaign that has no forecast data — it should show "Forecast data not available for this campaign".
result: pass

## Summary

total: 7
passed: 5
issues: 0
pending: 0
skipped: 2

## Gaps

[none yet]
