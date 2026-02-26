# Phase 10: Dashboard Polish & Integration Fixes - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the 2 remaining integration gaps (insights market filter + export flattening) and fix dashboard data display quality issues. Specifically: insights page ignores market filter, health/seasonality exports produce garbled `[object Object]` output, MethodologySidebar shows `undefined` for dataPoints, and ForecastActualChart renders scaffold approximation instead of real Prophet data.

</domain>

<decisions>
## Implementation Decisions

### Export format
- Column naming convention: Claude's discretion — pick the best approach based on existing export patterns in the codebase
- Numeric values: Claude's discretion — match how existing campaign exports handle formatting (raw vs formatted)
- CSV is the priority format; Excel is nice-to-have
- Seasonality export: wide format — one row per campaign, columns for each monthly index (jan_index through dec_index)

### Insights market filtering
- Empty market state: show "No incrementality data for [Market Name] yet" message — clear, not confusing
- Reuse the same market filter dropdown component from dashboard/recommendations pages — consistent UX, shared filter state
- Everything filters: summary stats, charts, and tables all reflect the selected market
- Filter state syncs with dashboard: if user selected 'US' on dashboard, insights page starts filtered to 'US'

### Forecast chart (ForecastActualChart)
- Show confidence bands (shaded uncertainty intervals) around the forecast line
- Solid line for actual historical data, dashed line for forecast projection
- Show all available data by default (full historical range + forecast)
- Hover tooltips with exact date/value pairs — no zoom/pan

### Data fallbacks
- Missing numeric values: show em-dash (—), not 'undefined', 'N/A', or zero
- Differentiate loading vs missing: loading skeleton while fetching, em-dash for truly absent data
- Charts with no data: show empty state message in chart area (e.g., "Forecast data not available for this campaign")
- Audit the entire MethodologySidebar during research — fix all missing/wrong values found, not just dataPoints

### Claude's Discretion
- Export column naming convention (dot notation vs underscore flat vs other)
- Export number formatting approach
- Excel export fix (nice-to-have after CSV is working)
- Loading skeleton design
- Exact empty state message wording
- Chart color palette for forecast confidence bands

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Fix bugs to match existing dashboard patterns and conventions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-dashboard-polish-and-integration-fixes*
*Context gathered: 2026-02-26*
