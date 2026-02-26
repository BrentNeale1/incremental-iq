# Phase 10: Dashboard Polish & Integration Fixes - Research

**Researched:** 2026-02-26
**Domain:** Next.js React frontend — data wiring, export flattening, chart upgrades
**Confidence:** HIGH (all findings verified by direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Export format:**
- Column naming convention: Claude's discretion — pick the best approach based on existing export patterns in the codebase
- Numeric values: Claude's discretion — match how existing campaign exports handle formatting (raw vs formatted)
- CSV is the priority format; Excel is nice-to-have
- Seasonality export: wide format — one row per campaign, columns for each monthly index (jan_index through dec_index)

**Insights market filtering:**
- Empty market state: show "No incrementality data for [Market Name] yet" message — clear, not confusing
- Reuse the same market filter dropdown component from dashboard/recommendations pages — consistent UX, shared filter state
- Everything filters: summary stats, charts, and tables all reflect the selected market
- Filter state syncs with dashboard: if user selected 'US' on dashboard, insights page starts filtered to 'US'

**Forecast chart (ForecastActualChart):**
- Show confidence bands (shaded uncertainty intervals) around the forecast line
- Solid line for actual historical data, dashed line for forecast projection
- Show all available data by default (full historical range + forecast)
- Hover tooltips with exact date/value pairs — no zoom/pan

**Data fallbacks:**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MRKT-04 | All reports and analysis can be segmented by market | API already accepts `marketId` param; hook and page need wiring to Zustand `selectedMarket` |
| RPRT-05 | User can export data as CSV/Excel | SheetJS `json_to_sheet` serializes nested objects as `[object Object]`; fix is to flatten before passing to export context |
</phase_requirements>

---

## Summary

Phase 10 addresses five distinct bugs, all of which are **React/TypeScript layer problems** — the backend (Python analysis, Drizzle/PostgreSQL, API routes) is largely correct. No new database migrations are required. No new packages are needed. Every fix involves either wiring existing state to a missing consumer, adding a missing field to an existing query/interface, or flattening data before passing it to the existing SheetJS export machinery.

The most significant change is the ForecastActualChart upgrade: a new Next.js API route (`/api/dashboard/forecast`) must proxy to the Python FastAPI service, fetch campaign metrics from DB, and return a `ForecastResponse`. The chart component then needs confidence band rendering via Recharts `Area` (same pattern already used in `ConfidenceIntervalChart`). The Python service is already fully built and working at `http://localhost:8000` (env: `ANALYSIS_SERVICE_URL`).

The market filter fix is a one-line insight: `useIncrementality` already accepts `campaignId` and `scoreType` params, but lacks a `marketId` param. The incrementality API route **already handles** `marketId` correctly (lines verified in route.ts). The insights page simply needs to read `selectedMarket` from Zustand and pass it through.

**Primary recommendation:** Fix all five items in the following order: (1) dataPoints in incrementality API, (2) market filter wiring in insights page, (3) export flattening for health + seasonality pages, (4) ForecastActualChart with real Prophet data + confidence bands. This ordering puts quick fixes first to validate the wiring pattern before the heavier forecast chart work.

---

## Standard Stack

### Core (no new installs — already in project)

| Library | Version in Project | Purpose | Notes |
|---------|-------------------|---------|-------|
| Recharts | Already installed (ConfidenceIntervalChart uses it) | Chart rendering with Area for confidence bands | `Area`, `AreaChart`, or adding `Area` to existing `LineChart` |
| SheetJS (xlsx) | Already installed (lib/export/excel.ts) | CSV/Excel export | Root cause of `[object Object]` — must flatten before passing |
| Zustand | Already installed (lib/store/dashboard.ts) | `selectedMarket` global state | Insights page not reading it |
| TanStack Query v5 | Already installed | Data fetching hooks | `useQuery` pattern established |
| date-fns | Already installed | Date formatting in charts | Already used in ForecastActualChart |

### No New Installations Required

All libraries needed are already present. The Python analysis service (`packages/analysis`) is already fully implemented and handles `/forecast` POST requests.

---

## Architecture Patterns

### Pattern 1: Market Filter Wiring (reference: performance/page.tsx)

The `selectedMarket` from Zustand is the single source of truth. The correct pattern is already in `performance/page.tsx`:

```typescript
// Source: apps/web/app/(dashboard)/performance/page.tsx
const selectedMarket = useDashboardStore((s) => s.selectedMarket);
const { data: campaignRows } = useCampaigns(dateRange, undefined, undefined, selectedMarket);
```

The insights page needs the same pattern — read `selectedMarket` from store, pass to `useIncrementality`.

### Pattern 2: useIncrementality Hook Extension

Current signature (apps/web/lib/hooks/useIncrementality.ts):
```typescript
export function useIncrementality(
  campaignId?: string,
  scoreType: 'adjusted' | 'raw' = 'adjusted',
)
```

Add `marketId?: string` and pass to query params. The API already handles it:
```typescript
// Source: apps/web/app/api/dashboard/incrementality/route.ts, line ~52
const marketId = searchParams.get('marketId');
// ...
if (marketId) {
  conditions.push(eq(incrementalityScores.marketId, marketId));
}
```

### Pattern 3: Empty Market State (reference: recommendations page pattern)

The performance/recommendations pages show a `CrossMarketSuggestions` component when market filter is active but returns no results. For insights, show a simple inline message when `scores.length === 0` and `selectedMarket` is set:

```tsx
// Show when no scores AND market is selected
const selectedMarketName = markets.find(m => m.id === selectedMarket)?.displayName;
if (selectedMarket && (!scores || scores.length === 0) && !scoresLoading) {
  return <EmptyMarketState marketName={selectedMarketName ?? 'this market'} />;
}
```

### Pattern 4: Export Flattening

SheetJS `json_to_sheet` calls `.toString()` on non-primitive values, producing `[object Object]`. Fix is to transform data before calling `setExportData`.

**Health page** — `IntegrationSyncHistory` has nested `integration` (object) and `recentRuns` (array of objects). Flatten to one row per integration:

```typescript
// Flatten IntegrationSyncHistory[] to flat records for CSV export
const flatHealth = (syncHistory.integrations as IntegrationSyncHistory[]).map((item) => ({
  platform: item.integration.platform,
  status: item.integration.status,
  freshness: item.integration.freshness,
  last_sync_status: item.integration.lastSyncStatus ?? '—',
  is_stale: item.isStale,
  stale_since_hours: item.staleSinceHours ?? '—',
  last_run_type: item.recentRuns[0]?.runType ?? '—',
  last_run_status: item.recentRuns[0]?.status ?? '—',
  records_ingested: item.recentRuns[0]?.recordsIngested ?? '—',
}));
setExportData(flatHealth, 'data-health');
```

**Seasonality page** — `SeasonalEvent` is almost flat (no nested objects), but `windowBefore`/`windowAfter` are strings that may need null handling. The CONTEXT asks for "wide format — one row per event". `SeasonalEvent[]` is already one row per event, just flatten the nulls:

```typescript
const flatSeasonality = (data.upcoming as SeasonalEvent[]).map((e) => ({
  name: e.name,
  event_date: e.eventDate,
  weeks_until: e.weeksUntil,
  days_until: e.daysUntil,
  window_before_days: e.windowBefore ?? '—',
  window_after_days: e.windowAfter ?? '—',
  is_user_defined: e.isUserDefined,
}));
setExportData(flatSeasonality, 'seasonality-planning');
```

Note: The CONTEXT says "one row per campaign, columns for each monthly index (jan_index through dec_index)" — this refers to the **historical performance** data shape, not the upcoming events. However, `HistoricalPerformance` already has flat numeric fields (`totalSpend`, `totalRevenue`, `roas`). The seasonality API does not return monthly indices — it returns event-period aggregates. The correct interpretation is to export the upcoming events flat (one row per event). The "monthly index" language likely refers to a future data model; current data has period-level historical aggregates.

### Pattern 5: dataPoints Fix — API Route

The `incrementality_scores` table has a `data_points` column (Drizzle: `dataPoints`). The API route's `RawScoreRow` and `RawScoreWithCampaign` interfaces do NOT include it, and the `select()` calls do not fetch it. The `IncrementalityScore` interface in the hook DOES include `dataPoints: number`.

Fix: add to the API route's select statements and response mapping:

```typescript
// In RawScoreRow interface:
dataPoints: string | null; // numeric() returns string

// In select():
dataPoints: incrementalityScores.dataPoints,

// In result mapping:
dataPoints: score.dataPoints ? parseInt(score.dataPoints, 10) : 0,
```

### Pattern 6: MethodologySidebar Audit

The sidebar already uses `String(selectedScore.dataPoints)` on line 200. When `dataPoints` is `undefined` (due to missing API field), this renders as the string `"undefined"`. Fix is purely in the API route (Pattern 5 above) — sidebar code is correct. No other fields are undefined: the sidebar correctly uses `'—'` for null saturation fields, and all ITS model fields are hardcoded (not dynamic).

### Pattern 7: ForecastActualChart — Prophet Data + Confidence Bands

**Step 1:** New API endpoint `GET /api/dashboard/forecast?campaignId=X`

This route fetches campaign metrics from DB then POSTs to the Python service:

```typescript
// apps/web/app/api/dashboard/forecast/route.ts
const ANALYSIS_URL = process.env.ANALYSIS_SERVICE_URL ?? 'http://localhost:8000';

// 1. Fetch campaign metrics from campaignMetrics table (same pattern as scoring worker)
// 2. POST to ${ANALYSIS_URL}/forecast with { tenant_id, campaign_id, metrics, forecast_days: 90 }
// 3. Return { historical: ForecastPoint[], future: ForecastPoint[] }
//    where ForecastPoint = { date, yhat, yhat_lower, yhat_upper }
```

**Step 2:** New `useForecast` hook in `lib/hooks/useForecast.ts`:

```typescript
export function useForecast(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['forecast', campaignId],
    queryFn: async () => fetch(`/api/dashboard/forecast?campaignId=${campaignId}`).then(r => r.json()),
    enabled: !!campaignId,
    staleTime: 10 * 60 * 1000,
  });
}
```

**Step 3:** Update `ForecastActualPoint` interface:

```typescript
export interface ForecastActualPoint {
  date: string;
  actual?: number;        // observed (historical segment only)
  forecast?: number;      // yhat (all points)
  forecastLower?: number; // yhat_lower
  forecastUpper?: number; // yhat_upper
}
```

**Step 4:** Update `ForecastActualChart` to use `Area` for confidence band — exact same pattern as `ConfidenceIntervalChart.tsx` which already uses Recharts stacked Areas.

**Step 5:** Update `insights/page.tsx`:
- Import `useForecast`, wire to `selectedRow?.id`
- Replace scaffold `forecastData` useMemo with real data from `useForecast`
- When no `selectedRow`, show empty state message per CONTEXT

### Pattern 8: Recharts Area for Confidence Bands (verified in existing code)

`ConfidenceIntervalChart.tsx` already implements the CI band pattern:

```typescript
// Source: apps/web/components/insights/ConfidenceIntervalChart.tsx
// ciBase = liftLower (transparent fill)
// ciBand = liftUpper - liftLower (gradient fill on top)
<Area dataKey="ciBase" stroke="none" fill="none" />
<Area dataKey="ciBand" stroke="none" fill="var(--color-lift)" fillOpacity={0.15} />
<Line dataKey="liftMean" stroke="var(--color-lift)" strokeWidth={2} dot={false} />
```

Apply this same pattern for forecast confidence bands in `ForecastActualChart`.

### Anti-Patterns to Avoid

- **Don't pass nested objects to `setExportData`**: SheetJS will produce `[object Object]` for any value that isn't a string, number, boolean, or Date. Always flatten first.
- **Don't add marketId to queryKey if filtering is server-side**: The insights page should include `marketId` in the queryKey so TanStack Query refetches on market change. (Unlike recommendations which does client-side filtering via `select`.)
- **Don't create a new market dropdown in insights**: The `MarketSelector` in `AppHeader` already handles UI — insights page only needs to READ `selectedMarket` from Zustand, not render a new control.
- **Don't call the Python service directly from the Next.js page**: Route through a Next.js API route to enforce session auth and avoid CORS issues.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CI band chart | Custom SVG polygon | Recharts stacked `Area` | Already implemented in ConfidenceIntervalChart |
| CSV flattening | Custom serializer | JS object spread / map() | Simple — just one level of nesting |
| Market display name | New fetch | Zustand `markets` array | Already in store via `useMarkets` in layout |
| Python forecast | Re-implement Prophet | `ANALYSIS_SERVICE_URL` proxy | Full Prophet model already built and tested |

---

## Common Pitfalls

### Pitfall 1: queryKey Must Include marketId
**What goes wrong:** Insights page reads `selectedMarket` but forgets to include it in `queryKey`. TanStack Query caches the old result and doesn't refetch when market changes.
**Why it happens:** Hook was designed without market awareness.
**How to avoid:** Update `queryKey: ['incrementality', campaignId, scoreType, marketId]` in `useIncrementality`.
**Warning signs:** Market changes in header dropdown but scores don't update on insights page.

### Pitfall 2: Drizzle numeric() Returns Strings
**What goes wrong:** `dataPoints` field reads as a string from Drizzle (numeric columns are string-typed). Sidebar does `String(selectedScore.dataPoints)` which would be fine, but the hook interface declares `dataPoints: number` — TypeScript won't catch the mismatch at runtime.
**Why it happens:** Drizzle `numeric()` returns `string | null` to preserve precision. Established project pattern (STATE.md): "NormalizedMetric numeric fields are string type — matches Drizzle numeric() column insert shape."
**How to avoid:** Parse with `parseInt(score.dataPoints, 10)` in the API route, return as `number` to the client. Keep hook interface as `dataPoints: number`.
**Warning signs:** Sidebar shows `NaN` instead of `undefined` if parseInt is missing.

### Pitfall 3: Python Forecast Service May Not Be Running
**What goes wrong:** New `/api/dashboard/forecast` route calls `ANALYSIS_SERVICE_URL` but the Python FastAPI process isn't running in dev. Route returns 500.
**Why it happens:** Python service is a separate process (`packages/analysis/main.py` via uvicorn).
**How to avoid:** Add graceful error handling — catch network errors and return a structured empty response `{ historical: [], future: [] }` so the chart shows its empty state message rather than an error.
**Warning signs:** Forecast chart shows "Forecast data not available" even when a campaign is selected — this is correct behavior when Python service is down.

### Pitfall 4: ForecastActualChart Data Source Changes
**What goes wrong:** The current `forecastData` in `insights/page.tsx` is a `useMemo` derived from `scores`. Replacing it with real Prophet data means the page now needs BOTH `useIncrementality` (for all other sections) and `useForecast` (for the chart). If `selectedRow` drives `useForecast`, the chart will only show data after a row is selected.
**Why it happens:** Original scaffold used existing scores data; real forecast requires a campaign selection.
**How to avoid:** When no row is selected, show the chart's empty state: "Select a campaign in the drill-down table to view forecast". This matches the MethodologySidebar's existing "Select a row..." empty state. CONTEXT says "Charts with no data: show empty state message in chart area."

### Pitfall 5: Health Export — IntegrationSyncHistory has `integration.integration` Nesting
**What goes wrong:** `IntegrationSyncHistory.integration` is of type `IntegrationFreshnessItem` which itself has nested fields. Accessing `item.integration` is correct; accessing deeper fields requires checking `IntegrationFreshnessItem`'s shape.
**Why it happens:** `IntegrationFreshnessItem` (from `useFreshness.ts`) includes: `id`, `platform`, `status`, `freshness`, `lastSyncStatus`, `lastSyncAt`. All are primitives — safe to spread directly.
**How to avoid:** Use the flat field access pattern shown in Pattern 4 above.

### Pitfall 6: Seasonality "Wide Format" Misinterpretation
**What goes wrong:** CONTEXT says "wide format — one row per campaign, columns for each monthly index (jan_index through dec_index)". Current seasonality data has NO monthly index fields — the DB and API return `SeasonalEvent[]` (upcoming events) and `HistoricalPerformance[]` (period aggregates). There is no monthly breakdown in the data model.
**Why it happens:** "Wide format" language may be aspirational or misapplied to the current data model.
**How to avoid:** Export what the data actually contains: flat `SeasonalEvent` rows for upcoming events. Do NOT attempt to fabricate monthly index columns that don't exist in the data. If "monthly index" fields are needed, that's a Phase 11+ data model change.

---

## Code Examples

### Export Flatten: Health Page

```typescript
// Source: Direct codebase inspection — IntegrationSyncHistory shape in useSyncHistory.ts
// Apply in apps/web/app/(dashboard)/health/page.tsx

React.useEffect(() => {
  if (syncHistory?.integrations && syncHistory.integrations.length > 0) {
    const flatRows = syncHistory.integrations.map((item) => ({
      platform: item.integration.platform,
      status: item.integration.status,
      freshness: item.integration.freshness,
      last_sync_status: item.integration.lastSyncStatus ?? '—',
      is_stale: item.isStale ? 'Yes' : 'No',
      stale_since_hours: item.staleSinceHours != null ? item.staleSinceHours : '—',
      last_run_type: item.recentRuns[0]?.runType ?? '—',
      last_run_status: item.recentRuns[0]?.status ?? '—',
      records_ingested: item.recentRuns[0]?.recordsIngested != null
        ? item.recentRuns[0].recordsIngested
        : '—',
    }));
    setExportData(flatRows, 'data-health');
  }
}, [syncHistory, setExportData]);
```

### Market Filter: Insights Page

```typescript
// Source: Direct inspection — selectedMarket in useDashboardStore
// Apply in apps/web/app/(dashboard)/insights/page.tsx

const selectedMarket = useDashboardStore((s) => s.selectedMarket);
const markets = useDashboardStore((s) => s.markets);

const { data: scores, isLoading: scoresLoading } = useIncrementality(
  undefined,
  'adjusted',
  selectedMarket ?? undefined, // new third param
);
```

### useIncrementality Hook Update

```typescript
// Apply in apps/web/lib/hooks/useIncrementality.ts

export function useIncrementality(
  campaignId?: string,
  scoreType: 'adjusted' | 'raw' = 'adjusted',
  marketId?: string,               // NEW
) {
  return useQuery<IncrementalityScore[]>({
    queryKey: ['incrementality', campaignId, scoreType, marketId],  // marketId in key
    queryFn: async () => {
      const params = new URLSearchParams({
        scoreType,
        ...(campaignId ? { campaignId } : {}),
        ...(marketId ? { marketId } : {}),         // NEW
      });
      const res = await fetch(`/api/dashboard/incrementality?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch incrementality: ${res.status}`);
      return res.json() as Promise<IncrementalityScore[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

### dataPoints: API Route Fix

```typescript
// Apply in apps/web/app/api/dashboard/incrementality/route.ts

// Add to RawScoreRow interface:
interface RawScoreRow {
  // ... existing fields ...
  dataPoints: string | null; // ADD THIS
}

// Add to select() in both campaign detail and overview modes:
dataPoints: incrementalityScores.dataPoints,

// Add to result mapping in both modes:
dataPoints: score.dataPoints ? parseInt(score.dataPoints, 10) : 0,
```

### Forecast API Route (new file)

```typescript
// Create: apps/web/app/api/dashboard/forecast/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { withTenant, campaignMetrics, campaigns } from '@incremental-iq/db';
import { eq, and, sql } from 'drizzle-orm';

const ANALYSIS_URL = process.env.ANALYSIS_SERVICE_URL ?? 'http://localhost:8000';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = session.user.tenantId;

  const campaignId = new URL(request.url).searchParams.get('campaignId');
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }

  // 1. Fetch campaign metrics from DB (last 365 days)
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const metrics = await withTenant(tenantId, async (tx) => {
    return tx.select({
      date: campaignMetrics.date,
      spend_usd: campaignMetrics.spendUsd,
      revenue: campaignMetrics.directRevenue,
      conversions: campaignMetrics.directConversions,
    })
    .from(campaignMetrics)
    .where(and(
      eq(campaignMetrics.tenantId, tenantId),
      eq(campaignMetrics.campaignId, campaignId),
      sql`${campaignMetrics.date} >= ${cutoffStr}`,
    ))
    .orderBy(campaignMetrics.date);
  });

  if (metrics.length < 30) {
    return NextResponse.json({ historical: [], future: [] });
  }

  // 2. Call Python /forecast
  try {
    const pyRes = await fetch(`${ANALYSIS_URL}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        campaign_id: campaignId,
        metrics: metrics.map(m => ({
          date: m.date,
          spend_usd: parseFloat(m.spend_usd ?? '0'),
          revenue: parseFloat(m.revenue ?? '0'),
          conversions: parseFloat(m.conversions ?? '0'),
        })),
        forecast_days: 90,
      }),
    });

    if (!pyRes.ok) {
      return NextResponse.json({ historical: [], future: [] });
    }

    const forecast = await pyRes.json();
    // Split historical vs future based on today
    const today = new Date().toISOString().slice(0, 10);
    const historical = forecast.forecast.filter((p: {date: string}) => p.date <= today);
    const future = forecast.forecast.filter((p: {date: string}) => p.date > today);

    return NextResponse.json({ historical, future });
  } catch {
    // Python service not running — return empty gracefully
    return NextResponse.json({ historical: [], future: [] });
  }
}
```

### ForecastActualChart: Confidence Bands

```typescript
// Pattern: mirror ConfidenceIntervalChart.tsx's Area stack approach
// Apply in apps/web/components/insights/ForecastActualChart.tsx

// Add to ForecastActualPoint:
forecastLower?: number;
forecastUpper?: number;

// In ChartContainer, replace LineChart with ComposedChart and add Areas:
import { ComposedChart, Area, Line, ... } from 'recharts';

// CI band (same stacked-area trick as ConfidenceIntervalChart):
<Area dataKey="forecastLower" stroke="none" fill="none" stackId="ci" />
<Area dataKey="ciWidth" stroke="none" fill="hsl(var(--chart-2))" fillOpacity={0.15} stackId="ci" />
// where ciWidth = forecastUpper - forecastLower (computed in data prep)

// Actual historical line — solid:
<Line dataKey="actual" strokeWidth={2} dot={false} />
// Forecast line — dashed:
<Line dataKey="forecast" strokeDasharray="5 3" strokeWidth={1.5} dot={false} />
```

---

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|------------------|--------|
| Scaffold forecast (liftMean * 1.08) | Real Prophet yhat with yhat_lower/yhat_upper | Phase 10 upgrade |
| Insights ignores market filter | Insights reads selectedMarket from Zustand, passes to API | Phase 10 fix |
| Health/Seasonality exports nested objects | Flatten before setExportData | Phase 10 fix |
| dataPoints: undefined in sidebar | API selects and returns data_points column | Phase 10 fix |

**Pattern already established in project (do not change):**
- Market filter reads from Zustand `selectedMarket` — NOT a new dropdown (MarketSelector in AppHeader handles UI)
- API routes accept `marketId` as query param — established in Phase 8
- Drizzle numeric() columns return string — parseInt in API, number in client interface
- SheetJS is the export library — no server-side export needed

---

## Open Questions

1. **Seasonality "monthly index" columns**
   - What we know: The CONTEXT.md mentions "wide format — one row per campaign, columns for each monthly index (jan_index through dec_index)"
   - What's unclear: No monthly index data exists in the DB schema or API response. The seasonality API returns `SeasonalEvent[]` (upcoming events) and `HistoricalPerformance[]` (period aggregates per event). No "campaign" entity is associated with seasonality data.
   - Recommendation: Export upcoming `SeasonalEvent[]` as flat rows (event-oriented, not campaign-oriented). Treat the "monthly index" requirement as aspirational/future — document this decision in the plan. If the user truly wants monthly campaign indices, that requires a new DB query against `campaignMetrics GROUP BY month`, which is a significant scope expansion.

2. **ForecastActualChart: what is "actual" for historical data?**
   - What we know: Prophet's forecast output includes historical fitted values (past dates in the forecast array have yhat = fitted value). The scoring worker already calls `/forecast` and gets back historical fits. The `actual` data (real revenue/spend) comes from `campaignMetrics`.
   - What's unclear: The API response splits on "today" but the chart wants actual observed values for the historical window, not Prophet fitted values.
   - Recommendation: Fetch campaign metrics for the historical segment and use `directRevenue` as the `actual` field. Use `yhat` from forecast output for the forecast line throughout. This requires the forecast API route to return both the raw metrics and the forecast output, or make a separate call.

3. **Python service availability in development**
   - What we know: The Python service runs at `ANALYSIS_SERVICE_URL ?? 'http://localhost:8000'`. It is a separate process. It may not be running during development.
   - Recommendation: Graceful fallback — when Python service is unavailable, return `{ historical: [], future: [] }` from the API route and show the chart's empty state. This is already planned in the code examples above.

---

## Validation Architecture

No test framework detected in the web app (no vitest.config.*, jest.config.*, or \*.test.ts files in `apps/web`). Python tests exist for the analysis package (`packages/analysis/tests/`).

Since `workflow.nyquist_validation` is not set in `.planning/config.json` (only `workflow.research`, `workflow.plan_check`, `workflow.verifier` are present), **the Validation Architecture section is omitted** and testing is manual/visual per the project's established pattern.

The Python analysis service tests (`packages/analysis/tests/test_forecast.py`) cover the forecast model. No new Python tests are needed for this phase.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `apps/web/lib/hooks/useIncrementality.ts` — hook interface, current params, queryKey shape
- `apps/web/app/api/dashboard/incrementality/route.ts` — confirms API already handles `marketId`, confirms `dataPoints` is missing from select/response
- `apps/web/lib/store/dashboard.ts` — `selectedMarket` in Zustand store, `markets` array
- `apps/web/app/(dashboard)/insights/page.tsx` — confirms `selectedMarket` not read, scaffold forecast
- `apps/web/components/insights/ForecastActualChart.tsx` — existing chart structure, `ForecastActualPoint` interface
- `apps/web/components/insights/MethodologySidebar.tsx` — `String(selectedScore.dataPoints)` on line 200, other fields use em-dash correctly
- `apps/web/app/(dashboard)/health/page.tsx` — nested `IntegrationSyncHistory[]` exported raw
- `apps/web/app/(dashboard)/seasonality/page.tsx` — `SeasonalEvent[]` exported, mostly flat
- `apps/web/lib/hooks/useSyncHistory.ts` — `IntegrationSyncHistory` shape with nested objects confirmed
- `apps/web/lib/hooks/useSeasonality.ts` — `SeasonalEvent` fields are all primitives (safe to use as-is)
- `apps/web/lib/export/excel.ts` — SheetJS `json_to_sheet` root cause of `[object Object]`
- `apps/web/app/(dashboard)/performance/page.tsx` — reference pattern for market filter wiring
- `apps/web/components/layout/DashboardLayoutClient.tsx` — `useMarkets` called at layout level
- `apps/web/components/insights/ConfidenceIntervalChart.tsx` — stacked Area pattern for CI bands
- `packages/db/src/schema/incrementality-scores.ts` — `dataPoints: numeric('data_points', ...)` confirmed
- `packages/analysis/routers/forecast.py` — Python `/forecast` endpoint confirmed working
- `packages/analysis/schemas/responses.py` — `ForecastPoint` shape: `date, yhat, yhat_lower, yhat_upper`
- `packages/ingestion/src/scoring/worker.ts` — `ANALYSIS_SERVICE_URL` env var pattern, how metrics are fetched and POSTed to Python
- `.planning/STATE.md` — Drizzle numeric() returns string (established project pattern)

### Secondary (MEDIUM confidence)

None — all claims verified by direct source code inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified as installed, no new installs needed
- Architecture: HIGH — all patterns verified by direct file inspection in codebase
- Pitfalls: HIGH — all pitfalls derived from actual code gaps found during research

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable codebase, 30-day window)
