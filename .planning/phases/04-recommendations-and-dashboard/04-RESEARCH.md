# Phase 4: Recommendations and Dashboard - Research

**Researched:** 2026-02-24
**Domain:** Next.js 15 dashboard UI, recommendation engine, data visualization, export, notifications
**Confidence:** HIGH (stack verified with official docs and Context7), MEDIUM (recommendation math), LOW (brand-color extraction)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recommendation Framing**
- Scale-up recommendations use specific numbers: "Increase Campaign X budget by 25% ($500/day → $625/day) for 3 weeks — expected +$12K incremental revenue"
- Multiple recommendations ranked by expected impact — highest incremental revenue at top, confidence indicator per recommendation
- When confidence is low: primary path is "wait for more data" with countdown to next analysis date; secondary path offers holdout test as an accelerator option ("can't wait? run a 2-week holdout test on 10% of spend")
- Holdout tests are never the first option — only offered when statistical modeling lacks sufficient confidence, and only as an alternative to waiting

**Seasonal Pre-alerts**
- Proactive cards in a dedicated "Upcoming" section at top of dashboard
- Format: "BFCM in 6 weeks: Campaign X scaled +40% last year, consider ramping now"
- Seasonality Planning page expands on this with calendar timeline and historical comparison

**Navigation and Page Structure**
- Collapsible sidebar navigation — smooth, natural animation and reliable open/close behavior (non-buggy)
- Five main pages: Executive Overview, Marketing Performance, Statistical Insights, Seasonality Planning, Data Health
- Shared state across pages — same date range and filters apply everywhere; switching pages shows the same data slice
- Integration freshness indicators in sidebar (quick status) + full detail on Data Health page

**Executive Overview Page**
- KPI-first layout — 4 equal-sized customizable KPI cards at top
- KPI cards are draggable/reorderable and swappable — user picks which 4 metrics to show
- User's KPI selection and ordering persisted across sessions
- One hero chart below KPIs (incremental revenue over time)
- Further down: smaller supporting charts — platform growth comparison, recent test results, expected seasonality trends with year progress indicator
- Recommendations section below charts

**Marketing Performance Page**
- Priority queue at top — urgent campaign actions ranked: scale, watch, investigate
- Platform tabs below (Meta, Google, All) — each tab shows that platform's performance, cross-platform insights, and opportunities
- Practical, action-oriented — less stats, more "here's what to do"

**Statistical Insights Page**
- Model health and trends overview at top — model accuracy over time, forecast vs actual overlays, confidence trend lines
- Expandable deep-dive sections for each metric — raw statistical outputs, hypothesis testing results, detailed confidence intervals, methodology comparisons, data quality metrics
- Long-range progression view — last 12 months performance progression, experiment history, model improvement over time
- Methodology sidebar — persistent collapsible panel showing full model details (ITS model type, window size, Prophet baseline parameters)
- Expandable table rows with preset and custom filters for campaign → cluster → channel drill-down

**Seasonality Planning Page**
- Calendar timeline (forward-looking) — visual timeline showing upcoming retail events with budget recommendations per campaign
- Historical comparison section — last year's performance during each seasonal period with this year's forecast

**Data Health Page**
- Previous sync history and status per integration
- Missing data gaps over time
- Advanced integration settings
- Direct links to reconnect/fix broken integrations

**Date Range and Comparison**
- Default view: last 30 days
- Preset options: 7, 14, 30, 90 days + custom range
- Toggle-based comparison mode — activates second date range picker, KPIs show deltas, charts overlay both periods

**Visual Design Direction**
- Page density gradient — clean analytical at top of each page, transitioning to richer data visualization toward the bottom
- Dark and light mode with toggle, persisted per user. Light mode default.
- Brand-forward palette — Incremental IQ default brand colors (to be provided), with option for each tenant to use their own brand colors
- During onboarding: prompt "Default Colours" or "Use My Brand's Colours" — if custom, system reviews their website and auto-extracts identifiable brand colors, which user can adjust
- Chart styling: Gradient fills — area charts with gradient fills fading to transparent, smooth line charts, rounded bar charts
- Typography: Inter Bold for headings (42px titles), Manrope for body text
- Animations: 400ms transitions — smooth and seamless, never feels like waiting
- Table density: Comfortable spacing throughout

**Empty and Loading States**
- First-time experience: Progress dashboard showing setup status with placeholder states
- Famous business/marketing quotes on loading sections
- Page loading: Skeleton loaders + progressive loading — skeletons shown immediately, KPIs resolve first, charts second, tables last
- Empty sections: Contextual empty states with specific messaging per section
- Stale data: Inline warning banners with fix-it link. Never hide the dashboard.

**Notifications and Alerts**
- In-app notifications (notification bell with unread badge) for: anomaly detected, new recommendation ready, seasonal alert, data health issues
- Email notifications for data health issues and seasonal deadlines only
- Notification format: brief message with link to relevant page/section
- Simple toggles in settings — per notification type, per channel (in-app vs email)

**Export**
- CSV and Excel export for all visible data (details left to Claude's discretion)

**Mobile Responsiveness**
- Full dashboard usable on mobile browsers (details left to Claude's discretion)

### Claude's Discretion
- Export UX details (CSV vs Excel defaults, what's exportable, button placement)
- Mobile responsive layout breakpoints and adaptations
- Exact KPI metric options available for customization
- Specific quote collection for loading states
- Notification bell interaction design
- Email template design
- Collapsible sidebar breakpoint behavior on mobile

### Deferred Ideas (OUT OF SCOPE)
- Product Overview page — product-type breakdown for ecommerce. Future phase.
- Customer Segmentation page — new vs returning customers, LTV insights. Future phase.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RECC-01 | System defaults to scaling-first recommendations ("increase budget by X% for Y weeks") | Recommendation engine reads Hill saturation data from `saturation_estimates` + incrementality scores; budget headroom computed from Hill curve parameters |
| RECC-02 | Each recommendation includes expected outcome (simple estimate for owners, ranges with confidence for analysts) | Dual-view pattern: RPRT-07 same data, different rendering. Business owner gets single number, analyst view gets liftLower/liftUpper CI + confidence value |
| RECC-03 | System states uncertainty transparently and suggests specific tests to resolve data gaps | Low-confidence path: `incrementality_scores.status = 'insufficient_data'` triggers "wait for more data" card with countdown to next scoring run |
| RECC-04 | System can design holdout test when statistical modeling lacks sufficient confidence | Holdout test design page/modal — geo split proposal or budget holdback percentage, rendered only when confidence gate fails |
| RECC-05 | System proactively suggests budget adjustments ahead of known seasonal periods | `seasonal_events` table (system events) + `incrementality_scores` history → "BFCM in 6 weeks: last year +40%" cards |
| RECC-06 | Holdout tests suggested only as a last resort, never first option | UI gating: holdout option is hidden unless confidence < threshold; shown as "secondary accelerator" below "wait" path |
| RPRT-01 | Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %) | Aggregate queries on `campaign_metrics` (spendUsd, directRevenue, directRoas) + `incrementality_scores` (liftMean) over selected date range |
| RPRT-02 | User can select date ranges (7/14/30/90 days, custom range, comparison period) | Date range state in Zustand; shadcn Calendar + date-fns; DateRangePicker component with presets and comparison toggle |
| RPRT-03 | Multi-level view: campaign → cluster → channel → overall rollups | `incrementality_scores` rollup rows (sentinel convention from Phase 3) already contain cluster/channel/overall rollups; drill-down table reads them |
| RPRT-04 | Data freshness indicator per connected integration | `sync_runs` table (Phase 2); sidebar badge + Data Health page detail |
| RPRT-05 | User can export data as CSV/Excel | SheetJS (xlsx) client-side export; triggered from visible data state |
| RPRT-06 | Web UI is mobile-responsive | Tailwind responsive breakpoints; collapsible sidebar becomes Sheet on mobile |
| RPRT-07 | Dual-audience views: simple summaries for business owners, detailed statistical output for analysts | Role toggle (Executive/Analyst view) in UI state; same API data, different component rendering |
</phase_requirements>

---

## Summary

Phase 4 is the highest-complexity phase of this project — it spans backend recommendation logic, a data query layer, and a feature-rich frontend. The statistical engine from Phase 3 already produces all necessary data: incrementality scores (liftMean, liftLower, liftUpper, confidence, status), saturation estimates (Hill curve parameters: alpha, mu, gamma, saturationPct), budget changes, and seasonal events. The primary work is (1) a recommendation engine that reads these outputs and generates typed recommendation objects, (2) a dashboard query API layer, and (3) the Next.js UI consuming it.

The project already has Next.js 15 + React 19 in `apps/web` with no UI libraries installed yet — this is a greenfield frontend build. The standard stack for this project is shadcn/ui (component primitives + charts built on Recharts) with Tailwind CSS, Zustand for global client state (date range, view mode, KPI order, dark mode), and TanStack Query for server-state caching. Given React 19, a pnpm override for `react-is` is needed for Recharts compatibility.

The recommendation math is well-defined: available budget headroom is derived from the Hill saturation curve (`hillMu` half-saturation point, current spend vs `hillAlpha` maximum), and expected incremental revenue is derived from `liftMean` applied to projected revenue at the proposed spend level. The formula is tractable in TypeScript without a Python sidecar for Phase 4.

**Primary recommendation:** Build the recommendation engine as a pure TypeScript module in a new `packages/recommendations` package or within `packages/ingestion/src/recommendations/`. Use shadcn/ui + Recharts for all charts, dnd-kit for KPI card drag-reorder, SheetJS for export, Resend + react-email for transactional emails, and Zustand for shared dashboard state.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui | latest (pnpm dlx shadcn@latest) | Component primitives (Button, Card, Sheet, Sidebar, Dialog, Table, Badge, Skeleton, Calendar, Popover, Select, Tabs, Collapsible, Tooltip) | Copy-paste architecture means zero lock-in; full React 19 + Tailwind v4 support as of latest release |
| Recharts | ^2.15 (via shadcn chart add) | Chart rendering inside ChartContainer wrapper | shadcn/ui chart component is built on Recharts; shadcn upgrading to v3 but v2.15 is stable default |
| Tailwind CSS | v4 (already inferred from Next.js 15 project) | Utility-first styling; CSS-first config via @theme block | Established in project; v4 adds 100x faster incremental builds |
| next-themes | ^0.4.x | Dark/light mode toggle with SSR-safe hydration | Official shadcn recommendation for dark mode in Next.js |
| Zustand | ^5.x | Client-side global state (date range, view mode, KPI selection, notification count) | Lightweight, hook-based; best choice for 2025 SaaS dashboards; persist middleware for localStorage |
| TanStack Query | ^5.x (@tanstack/react-query) | Server-state caching for dashboard data API calls | v5 stable; native App Router integration; prevents double-fetching across pages |
| dnd-kit | @dnd-kit/core @dnd-kit/sortable | Draggable/sortable KPI cards | Modern, accessible, lightweight; useSortable hook is the standard pattern |
| date-fns | ^3.x (already in package.json) | Date formatting and range arithmetic | Already installed; shadcn Calendar + date-fns is the standard pairing |
| react-day-picker | ^9.x (installed by shadcn Calendar) | Calendar UI for date range selection | Installed by shadcn Calendar component automatically |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SheetJS (xlsx) | ^0.18.x | CSV and Excel file generation and download | Client-side export; works in browser without server round-trip |
| file-saver | ^2.x | Browser file download trigger | Pair with SheetJS for `saveAs()` |
| Resend | ^4.x | Transactional email delivery | Email notifications for data health and seasonal deadlines |
| react-email | ^3.x | React-component-based email templates | Co-created with Resend; renders to HTML string for Resend API |
| lucide-react | ^0.4xx | Icon library | Already used by shadcn/ui internally; consistent icon set |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui charts (Recharts) | Tremor | Tremor is higher-level but heavier (~200KB gzipped vs ~50KB for shadcn); less control over gradient fills and custom animations required by design spec |
| shadcn/ui charts (Recharts) | Chart.js / react-chartjs-2 | Canvas-based vs SVG; SVG is required for gradient area fills matching design spec |
| Zustand | Jotai | Jotai is atom-based; Zustand store is better for complex dashboard state with cross-slice updates (date range affects all 5 pages) |
| SheetJS | ExcelJS | SheetJS is simpler for client-side export; ExcelJS is better for server-side complex formatting. Client-side is correct here. |
| TanStack Query | SWR | TanStack Query v5 has better App Router integration and supports complex cache invalidation patterns |
| Resend | SendGrid / Postmark | Resend is built for Next.js; react-email co-creator; simplest integration |

**Installation:**
```bash
# shadcn/ui init (in apps/web)
pnpm dlx shadcn@latest init

# shadcn components
pnpm dlx shadcn@latest add button card sheet sidebar dialog table badge skeleton calendar popover select tabs collapsible tooltip separator scroll-area

# shadcn chart primitive (built on Recharts)
pnpm dlx shadcn@latest add chart

# React 19 + Recharts compatibility override (add to apps/web/package.json)
# "pnpm": { "overrides": { "react-is": "^19.0.0" } }

# Core libraries
pnpm add zustand @tanstack/react-query @tanstack/react-query-devtools next-themes lucide-react --filter @incremental-iq/web

# dnd-kit for KPI card reorder
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --filter @incremental-iq/web

# Export
pnpm add xlsx file-saver --filter @incremental-iq/web
pnpm add -D @types/file-saver --filter @incremental-iq/web

# Email
pnpm add resend react-email @react-email/components --filter @incremental-iq/web

# Fonts (Google Fonts via next/font)
# Inter + Manrope loaded via next/font/google — no install needed
```

---

## Architecture Patterns

### Recommended Project Structure
```
apps/web/
├── app/
│   ├── (dashboard)/              # Route group — all 5 pages share layout
│   │   ├── layout.tsx            # Sidebar + header + ThemeProvider + QueryProvider
│   │   ├── page.tsx              # Executive Overview (/)
│   │   ├── performance/
│   │   │   └── page.tsx          # Marketing Performance
│   │   ├── insights/
│   │   │   └── page.tsx          # Statistical Insights
│   │   ├── seasonality/
│   │   │   └── page.tsx          # Seasonality Planning
│   │   └── health/
│   │       └── page.tsx          # Data Health
│   └── api/
│       ├── dashboard/
│       │   ├── kpis/route.ts     # KPI aggregates for date range
│       │   ├── campaigns/route.ts # Campaign drill-down data
│       │   ├── incrementality/route.ts # Incrementality scores + rollups
│       │   ├── saturation/route.ts    # Saturation curve data
│       │   └── seasonality/route.ts   # Upcoming seasonal events
│       ├── recommendations/
│       │   └── route.ts          # Typed recommendation list
│       ├── notifications/
│       │   ├── route.ts          # List + mark-read
│       │   └── preferences/route.ts # Notification settings
│       └── export/
│           └── route.ts          # Server-side export trigger (optional)
├── components/
│   ├── ui/                       # shadcn/ui auto-generated components
│   ├── dashboard/
│   │   ├── KpiCard.tsx           # Draggable KPI card with shadcn Card
│   │   ├── KpiGrid.tsx           # dnd-kit SortableContext wrapper
│   │   ├── DateRangePicker.tsx   # shadcn Calendar + Popover + presets
│   │   ├── ComparisonToggle.tsx  # Toggle comparison date range mode
│   │   ├── ViewToggle.tsx        # Executive / Analyst view switcher
│   │   └── ExportButton.tsx      # SheetJS trigger
│   ├── charts/
│   │   ├── IncrementalRevenueChart.tsx  # Area chart with gradient fill
│   │   ├── SaturationCurveChart.tsx     # Line chart showing Hill curve
│   │   ├── PlatformComparisonChart.tsx  # Bar chart by platform
│   │   ├── ConfidenceIntervalChart.tsx  # Error bar / range chart
│   │   └── SeasonalityTimelineChart.tsx # Calendar heatmap / line overlay
│   ├── recommendations/
│   │   ├── RecommendationCard.tsx       # Scale-up card (business view)
│   │   ├── RecommendationAnalystCard.tsx # With CI, p-value (analyst view)
│   │   ├── LowConfidenceCard.tsx        # Wait / holdout secondary path
│   │   └── SeasonalAlertCard.tsx        # BFCM pre-alert card
│   ├── notifications/
│   │   ├── NotificationBell.tsx  # Bell icon + unread badge
│   │   └── NotificationPanel.tsx # Popover/Sheet with list
│   └── layout/
│       ├── AppSidebar.tsx        # shadcn Sidebar component
│       ├── SidebarNav.tsx        # Nav items + freshness badges
│       └── ThemeToggle.tsx       # Dark/light toggle
├── lib/
│   ├── store/
│   │   ├── dashboard.ts          # Zustand store: date range, view mode, KPI order
│   │   └── notifications.ts     # Zustand store: unread count
│   ├── query/
│   │   └── client.ts            # TanStack QueryClient singleton
│   ├── recommendations/
│   │   └── engine.ts            # Pure TypeScript recommendation engine
│   └── export/
│       └── excel.ts             # SheetJS export helpers
└── emails/
    ├── DataHealthAlert.tsx       # react-email template
    └── SeasonalDeadline.tsx      # react-email template
```

### New DB Schema Required (Phase 4 additions)
```
packages/db/src/schema/
├── notifications.ts              # In-app notification rows (tenantId, type, message, read, link)
├── user-preferences.ts           # Per-tenant preferences (kpiOrder, viewMode, darkMode, brandColors, notifPrefs)
└── recommendations.ts            # Persisted recommendation rows (or generate on-the-fly from scores — see Open Questions)
```

### Pattern 1: Recommendation Engine (TypeScript)

**What:** Pure TypeScript module that reads scored data and outputs typed `Recommendation` objects.
**When to use:** Called from `/api/recommendations` route. NOT a BullMQ job — compute on-demand (fast: O(n) over campaigns).

**Recommendation type hierarchy:**
```typescript
// Source: internal design based on CONTEXT.md locked decisions

type RecommendationAction = 'scale_up' | 'watch' | 'investigate';
type RecommendationConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

interface Recommendation {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: string;
  action: RecommendationAction;
  confidenceLevel: RecommendationConfidenceLevel;

  // Scale-up specifics (when action === 'scale_up')
  budgetIncreasePct?: number;       // e.g., 25 (percent)
  currentDailySpend?: number;       // e.g., 500.00
  proposedDailySpend?: number;      // e.g., 625.00
  durationWeeks?: number;           // e.g., 3
  expectedIncrementalRevenue?: number; // e.g., 12000.00

  // Statistical detail (for analyst view)
  liftMean?: number;
  liftLower?: number;
  liftUpper?: number;
  confidence?: number;
  saturationPct?: number;

  // Low-confidence path
  nextAnalysisDate?: Date;
  holdoutTestDesign?: HoldoutTestDesign;

  // Ranking
  expectedImpact: number;           // Sort key: expectedIncrementalRevenue or confidence * spend

  // Seasonal context
  upcomingEvent?: string;           // e.g., 'BFCM in 6 weeks'
}

interface HoldoutTestDesign {
  holdbackPct: number;              // e.g., 10 (%)
  durationWeeks: number;            // e.g., 2
  estimatedSampleSize: number;
}
```

**Budget headroom formula (from Hill curve):**
```typescript
// Source: packages/ingestion/src/scoring/ saturation math, CONTEXT.md

function computeBudgetRecommendation(
  currentSpendDaily: number,
  hillAlpha: number,   // theoretical max revenue
  hillMu: number,      // half-saturation spend level
  hillGamma: number,   // steepness
  saturationPct: number, // current position 0.0–1.0
  liftMean: number,
  confidence: number,
): { budgetIncreasePct: number; durationWeeks: number; expectedRevenue: number } | null {

  // Only recommend if saturation < 0.80 (20%+ headroom remaining)
  if (saturationPct >= 0.80) return null;

  // Revenue at proposed spend using Hill function:
  // f(x) = alpha * x^gamma / (mu^gamma + x^gamma)
  const currentRevenue = hillAlpha * Math.pow(currentSpendDaily, hillGamma)
    / (Math.pow(hillMu, hillGamma) + Math.pow(currentSpendDaily, hillGamma));

  // Propose scaling to 75th percentile of saturation headroom
  const headroomPct = 1.0 - saturationPct;
  const scaleFactor = Math.min(1.0 + headroomPct * 0.75, 1.5); // cap at 50% increase
  const proposedSpend = currentSpendDaily * scaleFactor;

  const proposedRevenue = hillAlpha * Math.pow(proposedSpend, hillGamma)
    / (Math.pow(hillMu, hillGamma) + Math.pow(proposedSpend, hillGamma));

  const expectedIncrementalRevenue = (proposedRevenue - currentRevenue) * liftMean * 7 * 3; // 3 weeks
  const budgetIncreasePct = Math.round((scaleFactor - 1) * 100);

  return {
    budgetIncreasePct,
    durationWeeks: 3,
    expectedRevenue: Math.round(expectedIncrementalRevenue),
  };
}
```

### Pattern 2: Zustand Dashboard Store
**What:** Single Zustand store for cross-page shared state. Persisted to localStorage for KPI order and view mode.
**When to use:** Wrap app in `<QueryClientProvider>` and `<ThemeProvider>` in the dashboard layout; Zustand accessed via hooks in any client component.

```typescript
// Source: Zustand docs + dashboard architecture pattern

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardStore {
  // Date range (not persisted — reset on visit)
  dateRange: { from: Date; to: Date };
  comparisonRange: { from: Date; to: Date } | null;
  comparisonEnabled: boolean;
  setDateRange: (range: { from: Date; to: Date }) => void;
  setComparisonRange: (range: { from: Date; to: Date } | null) => void;
  toggleComparison: () => void;

  // View mode (persisted)
  viewMode: 'executive' | 'analyst';
  setViewMode: (mode: 'executive' | 'analyst') => void;

  // KPI card order (persisted)
  kpiOrder: string[]; // e.g., ['spend', 'revenue', 'roas', 'incremental_revenue']
  setKpiOrder: (order: string[]) => void;
}

// Non-persisted parts use plain create()
// Persisted parts use persist() middleware with partialize

// PITFALL: SSR hydration mismatch — use skipHydration: true in persist config
// and call useStore.persist.rehydrate() in a useEffect on mount
```

### Pattern 3: TanStack Query for API Data
**What:** useQuery hooks for all dashboard data fetching with stale-while-revalidate.
**When to use:** All client components that read from the dashboard API routes.

```typescript
// Source: TanStack Query v5 docs

import { useQuery } from '@tanstack/react-query';

function useKpis(dateRange: DateRange) {
  return useQuery({
    queryKey: ['kpis', dateRange.from, dateRange.to],
    queryFn: () =>
      fetch(`/api/dashboard/kpis?from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`)
        .then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes — dashboard data changes only on scoring runs
  });
}
```

### Pattern 4: shadcn Sidebar (Collapsible)
**What:** shadcn built-in Sidebar component with useSidebar() hook, Sheet on mobile.
**When to use:** Root dashboard layout.

```typescript
// Source: ui.shadcn.com/docs/components/sidebar

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// SidebarProvider manages open/closed state
// On mobile (< 768px): renders as Sheet (slide-over)
// On desktop: renders as collapsible icon rail or full sidebar
// useSidebar() hook provides: open, setOpen, isMobile, openMobile, setOpenMobile
```

### Pattern 5: shadcn Chart with Gradient Area Fill

```typescript
// Source: ui.shadcn.com/docs/components/chart

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  incrementalRevenue: {
    label: "Incremental Revenue",
    color: "hsl(var(--chart-1))",
  },
};

// Gradient definition in SVG defs:
// <defs>
//   <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
//     <stop offset="5%" stopColor="var(--color-incrementalRevenue)" stopOpacity={0.8}/>
//     <stop offset="95%" stopColor="var(--color-incrementalRevenue)" stopOpacity={0.1}/>
//   </linearGradient>
// </defs>
// Then: <Area fill="url(#fillRevenue)" stroke="var(--color-incrementalRevenue)" />
```

### Pattern 6: dnd-kit Sortable KPI Cards

```typescript
// Source: dndkit.com docs, @dnd-kit/sortable

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableKpiCard({ id, metric }: { id: string; metric: KpiMetric }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KpiCard metric={metric} />
    </div>
  );
}

// onDragEnd handler: arrayMove(kpiOrder, oldIndex, newIndex)
// then setKpiOrder() in Zustand → persisted to localStorage
```

### Pattern 7: SheetJS Client-Side Export

```typescript
// Source: SheetJS docs (docs.sheetjs.com)

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/octet-stream' }),
    `${filename}.xlsx`
  );
}

function exportToCsv(data: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  saveAs(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${filename}.csv`
  );
}
```

### Pattern 8: Skeleton Progressive Loading

```typescript
// Source: shadcn/ui Skeleton component

// Loading sequence:
// 1. Immediately: render Skeleton placeholders matching expected layout
// 2. KPIs resolve (fast query): replace KPI skeletons with real values
// 3. Charts resolve: replace chart skeletons
// 4. Tables resolve last: replace table skeleton

// Use TanStack Query isLoading for each sub-query:
const { data: kpis, isLoading: kpisLoading } = useKpis(dateRange);
const { data: campaigns, isLoading: campaignsLoading } = useCampaigns(dateRange);

// Conditional render:
if (kpisLoading) return <KpiGridSkeleton />;
```

### Anti-Patterns to Avoid
- **Single large API route that returns all dashboard data:** KPIs, charts, and tables should be separate queries so they can load progressively and invalidate independently.
- **Storing selected date range in URL params only:** Zustand is correct for cross-page shared state; URL params are additive for shareability (optional enhancement).
- **Blocking page render on all data:** Never await all queries before showing any UI — progressive loading with skeletons is mandatory per design spec.
- **Computing recommendations inside the React render:** Move all recommendation math to the API route handler; never do Hill curve math in a client component.
- **Direct Recharts import without ChartContainer wrapper:** The shadcn ChartContainer provides responsive sizing, color CSS variables, and accessibility attributes.
- **Calling `persist` rehydrate in SSR context:** Always use `skipHydration: true` and rehydrate in `useEffect` to avoid Next.js hydration mismatches.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode toggle | Custom CSS class switcher | next-themes | Handles SSR flash, localStorage persistence, and system preference detection automatically |
| Drag-reorder KPI cards | Custom mouse event handlers | @dnd-kit/sortable | Accessibility, keyboard support, touch events, animation — all handled |
| Date range picker | Custom calendar UI | shadcn Calendar + react-day-picker | Complex edge cases: month boundaries, disabled dates, range selection |
| Excel/CSV export | Manual CSV string builder | SheetJS (xlsx) | Handles encoding, special characters, multi-sheet, date serialization |
| Collapsible sidebar | Custom CSS transitions | shadcn Sidebar component | Built-in mobile Sheet, keyboard, animation, cookie persistence |
| Chart tooltips | Custom floating div | ChartTooltipContent | Positioning edge cases, RTL, pointer tracking |
| Email templates | HTML strings | react-email | Inline CSS, cross-client compatibility, responsive email |
| Toast notifications | Custom state | shadcn Sonner (via sonner package) | Stack management, dismiss, types |

**Key insight:** The shadcn/ui ecosystem provides all necessary UI primitives. Adding custom implementations duplicates testing burden and introduces browser-compatibility bugs in exactly the wrong places (drag-drop, date pickers, modals).

---

## Common Pitfalls

### Pitfall 1: Recharts + React 19 Peer Dependency Conflict
**What goes wrong:** `npm install` fails or produces runtime errors because Recharts 2.x depends on `react-is` at a version incompatible with React 19.
**Why it happens:** Recharts 2.x declared `react-is` as a peer dependency at React 16/17 version ranges.
**How to avoid:** Add pnpm overrides to `apps/web/package.json`:
```json
{
  "pnpm": {
    "overrides": {
      "react-is": "^19.0.0"
    }
  }
}
```
Alternatively, use `--legacy-peer-deps` during install. shadcn/ui docs explicitly document this pattern.
**Warning signs:** `Invalid hook call` errors at runtime; peer dependency warnings during install.

### Pitfall 2: Zustand Persist SSR Hydration Mismatch
**What goes wrong:** Next.js renders a different DOM on server vs client because localStorage values are not available during SSR, causing React hydration errors.
**Why it happens:** Zustand's persist middleware reads localStorage synchronously, but Next.js renders the same component on the server where localStorage is undefined.
**How to avoid:**
1. Use `skipHydration: true` in persist config.
2. Call `useStore.persist.rehydrate()` inside a `useEffect` on the layout component.
3. Render a loading skeleton until hydration completes (tracked with `useStore.persist._hasHydrated`).
**Warning signs:** Hydration error: "Prop `className` did not match"; incorrect initial state after page load.

### Pitfall 3: Rollup Rows Mixed with Campaign Rows in Incrementality Queries
**What goes wrong:** Dashboard queries on `incrementality_scores` return rollup sentinel rows (campaignId starting with `rollup:`) alongside real campaign rows, causing NaN values or duplicated metrics.
**Why it happens:** Phase 3 stores rollup rows in the same table using sentinel campaignIds with the groupKey encoded in `rawModelOutput.groupKey`.
**How to avoid:** All dashboard queries on `incrementality_scores` must filter by campaign vs rollup rows using `rawModelOutput->>'type' = 'rollup'` (or `IS NULL`) pattern. Separate query functions: `getCampaignScores()` filters OUT rollup rows; `getRollupScores(level)` filters FOR them.
**Warning signs:** Campaign-level ROAS showing aggregate values; duplicate totals.

### Pitfall 4: Hill Curve Math with NULL saturation_pct
**What goes wrong:** Recommendation engine crashes or produces NaN recommendations when saturation_pct is NULL (status = 'insufficient_variation' or 'error').
**Why it happens:** Not all campaigns have saturation estimates — Phase 3 explicitly sets saturationPct to NULL when spend CV < 0.15.
**How to avoid:** The recommendation engine must handle NULL saturation data gracefully. If `saturationEstimate` is missing or status is not 'estimated', fall back to: use liftMean × current spend as a proxy for expected impact. Avoid showing budget-specific numbers when Hill curve is unavailable.
**Warning signs:** NaN in recommendation cards; TypeError on hillMu/hillAlpha access.

### Pitfall 5: dnd-kit and Server Components
**What goes wrong:** Build fails because `@dnd-kit/core` uses browser APIs (DndContext uses event listeners) that are not available in React Server Components.
**Why it happens:** dnd-kit is a client-side-only library.
**How to avoid:** KpiGrid.tsx (the dnd-kit wrapper) must have `'use client'` directive at the top. The individual KpiCard components can be RSC-safe if they receive data as props.
**Warning signs:** `Event handlers cannot be passed to Client Component props` or `window is not defined` build errors.

### Pitfall 6: TanStack Query QueryClient in App Router
**What goes wrong:** Multiple QueryClient instances created, causing cache duplication and stale data.
**Why it happens:** Creating QueryClient at module level in server components or inside layout components causes re-creation on every render.
**How to avoid:**
```typescript
// lib/query/client.ts — use React.cache() or a singleton pattern
import { QueryClient } from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 60 * 1000 } } });
}

// Singleton for browser; fresh instance per request for server
let browserQueryClient: QueryClient | undefined;
export function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient(); // SSR: new per request
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
```
**Warning signs:** Queries refetch on every navigation; staleTime not respected.

### Pitfall 7: Export of Data Not Matching Current Filter State
**What goes wrong:** User exports data but gets all historical data instead of the currently filtered date range.
**Why it happens:** Export button reads from DB directly instead of from the current rendered dataset.
**How to avoid:** The export function reads from TanStack Query cache (already filtered by date range) or re-fetches with the same query params from Zustand. Never trigger an unfiltered DB export.

### Pitfall 8: Notification Polling vs Push
**What goes wrong:** Client polls `/api/notifications` every few seconds, hammering the DB.
**Why it happens:** In-app notifications with a "real-time" feeling tempt developers to use aggressive polling.
**How to avoid:** Use 60-second stale time in TanStack Query for notifications; notification badge count cached locally in Zustand. The BullMQ worker that generates notifications (anomalies, new scoring runs) writes to the `notifications` table; client re-fetches on focus + 60s interval. True real-time is not needed for Phase 4.

---

## Code Examples

Verified patterns from official sources:

### ChartContainer with Gradient Area Fill
```typescript
// Source: ui.shadcn.com/charts/area

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, defs, linearGradient, stop } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";

const config = {
  incrementalRevenue: { label: "Incremental Revenue", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

<ChartContainer config={config} className="min-h-[200px] w-full">
  <AreaChart data={data}>
    <defs>
      <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="var(--color-incrementalRevenue)" stopOpacity={0.8}/>
        <stop offset="95%" stopColor="var(--color-incrementalRevenue)" stopOpacity={0.1}/>
      </linearGradient>
    </defs>
    <CartesianGrid vertical={false} />
    <XAxis dataKey="date" />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Area
      type="monotone"
      dataKey="incrementalRevenue"
      fill="url(#fillRevenue)"
      stroke="var(--color-incrementalRevenue)"
      strokeWidth={2}
    />
  </AreaChart>
</ChartContainer>
```

### Date Range with Presets
```typescript
// Source: github.com/johnpolacek/date-range-picker-for-shadcn (community pattern)
// Presets: Today, 7 days, 14 days, 30 days, 90 days, Custom

import { subDays, startOfDay, endOfDay } from 'date-fns';

const presets = [
  { label: 'Last 7 days', range: { from: subDays(new Date(), 7), to: new Date() } },
  { label: 'Last 14 days', range: { from: subDays(new Date(), 14), to: new Date() } },
  { label: 'Last 30 days', range: { from: subDays(new Date(), 30), to: new Date() } },
  { label: 'Last 90 days', range: { from: subDays(new Date(), 90), to: new Date() } },
];
// Render as Button list beside Calendar in Popover
```

### Recommendation Confidence Gate
```typescript
// Source: internal design from CONTEXT.md

const CONFIDENCE_THRESHOLD = 0.65; // 65% minimum for scale-up recommendation

function classifyRecommendation(score: IncrementalityScore, saturation: SaturationEstimate | null) {
  if (score.status === 'insufficient_data') {
    return { action: 'investigate', confidenceLevel: 'insufficient' };
  }

  if (Number(score.confidence) < CONFIDENCE_THRESHOLD) {
    return {
      action: 'watch',
      confidenceLevel: 'low',
      // Primary: wait for more data
      nextAnalysisDate: getNextScoringDate(),
      // Secondary (only offered as alternative): holdout test
      holdoutTestDesign: {
        holdbackPct: 10,
        durationWeeks: 2,
        estimatedSampleSize: Math.round(Number(score.dataPoints) * 0.1),
      },
    };
  }

  // High confidence — compute scale-up
  const budgetRec = saturation
    ? computeBudgetRecommendation(...)
    : null; // Fall back to lift-based estimate only

  return { action: 'scale_up', confidenceLevel: 'high', ...budgetRec };
}
```

### Resend + react-email Data Health Alert
```typescript
// Source: resend.com/docs/send-with-nextjs

import { Resend } from 'resend';
import { DataHealthAlert } from '@/emails/DataHealthAlert';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'alerts@incremental-iq.com',
  to: tenant.email,
  subject: 'Action required: Meta Ads data is 3 days stale',
  react: DataHealthAlert({
    integrationName: 'Meta Ads',
    staleDays: 3,
    reconnectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/meta`,
  }),
});
```

### next-themes Setup
```typescript
// Source: ui.shadcn.com/docs/dark-mode/next

// apps/web/components/layout/ThemeProvider.tsx
'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

// apps/web/app/(dashboard)/layout.tsx
<html lang="en" suppressHydrationWarning>
  <body>
    <ThemeProvider>
      <SidebarProvider>
        {children}
      </SidebarProvider>
    </ThemeProvider>
  </body>
</html>
```

### Font Setup (Inter + Manrope)
```typescript
// Source: Next.js font documentation (next/font/google)
// apps/web/app/layout.tsx

import { Inter, Manrope } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

// In @theme block of globals.css (Tailwind v4):
// --font-heading: var(--font-inter);
// --font-body: var(--font-manrope);
```

---

## New DB Schema (Phase 4 Additions)

Two new tables are required. One optional.

### notifications table
```typescript
// packages/db/src/schema/notifications.ts

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type').notNull(), // 'anomaly' | 'recommendation' | 'seasonal' | 'data_health'
  message: text('message').notNull(),
  linkPath: text('link_path'), // e.g., '/health' or '/'
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('notifications_tenant_unread_idx').on(t.tenantId, t.read, t.createdAt),
  pgPolicy('tenant_isolation', { ... }),
]);
```

### user_preferences table
```typescript
// packages/db/src/schema/user-preferences.ts
// Stores per-tenant persisted UI preferences (one row per tenant)

export const userPreferences = pgTable('user_preferences', {
  tenantId: uuid('tenant_id').primaryKey(),
  // KPI card order — array of metric IDs
  kpiOrder: jsonb('kpi_order').$type<string[]>().default(['spend', 'revenue', 'roas', 'incremental_revenue']),
  // View mode — 'executive' | 'analyst'
  viewMode: text('view_mode').default('executive'),
  // Dark mode — 'light' | 'dark' | 'system'
  theme: text('theme').default('light'),
  // Notification preferences
  notificationPrefs: jsonb('notification_prefs').$type<NotificationPrefs>().default({
    anomaly: { inApp: true, email: false },
    recommendation: { inApp: true, email: false },
    seasonal: { inApp: true, email: true },
    data_health: { inApp: true, email: true },
  }),
  // Brand colors (extracted or default)
  brandColors: jsonb('brand_colors').$type<BrandColors | null>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', { ... }),
]);
```

### recommendations table (optional — see Open Questions)
Recommendations can be generated on-the-fly from scoring data (no persistence needed). A `recommendations` table only makes sense if we need to track acknowledgment state or push notifications on new recommendations. For Phase 4, generate on-demand from `incrementality_scores` + `saturation_estimates`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tremor for dashboards | shadcn/ui charts (Recharts-based) | 2024 | Tremor now built on shadcn; using shadcn directly is lighter and more customizable |
| Recharts 2.x raw import | Recharts 2.x via shadcn ChartContainer | 2024-2025 | ChartContainer adds color tokens, responsive sizing, accessibility |
| Recharts 2.x only stable version | Recharts 3.x (3.7.0 latest, stable) | 2025 | shadcn still upgrading to v3; use v2.15 via shadcn for now; v3 coming |
| Custom drag-drop (react-beautiful-dnd) | @dnd-kit/sortable | 2022+ | react-beautiful-dnd deprecated; dnd-kit is current standard |
| redux for global state | Zustand (v4/5) | 2022+ | Zustand is now default for SaaS dashboards without Redux boilerplate |
| Custom email HTML | react-email + Resend | 2023+ | Co-created stack; simplest DX for transactional email in Next.js |
| tailwind.config.js | Tailwind v4 CSS-first @theme block | Jan 2025 | No JS config needed; @theme in globals.css maps to utility classes |
| next-themes class strategy | next-themes with Tailwind v4 @variant dark | 2025 | New approach uses attribute="class" with @custom-variant dark in CSS |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Abandoned by Atlassian, use @dnd-kit
- Tremor (standalone): Now built on shadcn; use shadcn directly for less overhead
- Recharts <2.13: React 19 incompatible without workaround
- `tailwind.config.js` with v4: Not needed; use @theme in CSS

---

## Open Questions

1. **Recommendations: on-demand vs persisted?**
   - What we know: Recommendations are derived from `incrementality_scores` + `saturation_estimates`. These are already computed and stored.
   - What's unclear: Do we need a `recommendations` table, or compute at query time? Persisting enables "mark as read/acknowledged" and push notifications for new recommendations.
   - Recommendation: Compute on-demand for Phase 4 (simpler, no extra table). Add a `recommendations` table in Phase 4 only if the notification system needs to push "new recommendation ready" alerts — which it does (CONTEXT.md: "New recommendation ready" is one of the 4 notification types). Create a lightweight `recommendations` table with `acknowledged` flag and `notified` flag. BullMQ generates a notification row when a new scoring run produces changed recommendations.

2. **Brand color auto-extraction: scope for Phase 4?**
   - What we know: Onboarding prompt to scan user's website and extract brand colors is a locked decision. Color extraction requires either a server-side URL scraper (CSS extraction) or a third-party API.
   - What's unclear: Is color extraction in Phase 4 or deferred? There's no auth in Phase 4 (Phase 6), so "per-tenant brand colors" is technically incomplete until auth exists.
   - Recommendation: Implement `user_preferences.brandColors` schema and a default Incremental IQ palette now. Defer the website-scan extraction UX to Phase 6 (auth phase) when user identity and onboarding flow exist. For Phase 4, show a color palette editor with the default theme only.

3. **Confidence threshold for scale-up recommendation?**
   - What we know: CONTEXT.md says "confidence is low" triggers the wait path, but no exact threshold is specified.
   - What's unclear: Is the threshold configurable or hardcoded? What value?
   - Recommendation: Hardcode at 0.65 (65%) for Phase 4. This is the conventional minimum for directional confidence in Bayesian marketing models. Add as a named constant `SCALE_UP_CONFIDENCE_THRESHOLD = 0.65` for easy adjustment.

4. **Tailwind v4 vs v3 in the existing project?**
   - What we know: The project has Next.js 15 but no Tailwind config file found. The current `package.json` doesn't list Tailwind.
   - What's unclear: Did Phase 2 set up Tailwind? The layout.tsx has no global CSS import.
   - Recommendation: Wave 0 of Phase 4 must install and configure Tailwind v4 + shadcn/ui from scratch since no UI framework exists yet. Use `pnpm dlx shadcn@latest init` which installs Tailwind, shadcn configuration, and generates `globals.css` automatically.

5. **Mobile sidebar behavior?**
   - What we know: Full dashboard usable on mobile. Collapsible sidebar must feel natural.
   - What's unclear: Exact breakpoint for Sheet vs sidebar collapse behavior.
   - Recommendation: Follow shadcn Sidebar default — Sheet (slide-over) on screens <768px (md breakpoint). Sidebar trigger becomes hamburger icon in mobile header. Sidebar items collapse to icon-only rail at 768–1024px. Full expanded sidebar at >1024px.

---

## Suggested Plan Wave Structure

Based on the scope, Phase 4 should be organized into approximately 6 plans:

| Plan | Focus | Key Deliverables |
|------|-------|-----------------|
| 04-01 | Foundation | Tailwind v4 + shadcn/ui install; globals.css with Inter/Manrope fonts; ThemeProvider (dark/light); QueryClientProvider; Zustand dashboard store; DB schema additions (notifications, user_preferences); Drizzle migration |
| 04-02 | Dashboard layout + navigation | (dashboard) route group; AppSidebar with 5 nav items + freshness badges; collapsible sidebar; mobile Sheet; layout shell with date range picker and view toggle |
| 04-03 | Recommendation engine + API routes | TypeScript recommendation engine (Hill curve math, confidence gate, holdout design); `/api/recommendations` route; `/api/dashboard/kpis` and `/api/dashboard/campaigns` routes |
| 04-04 | Executive Overview + Marketing Performance pages | KPI grid with dnd-kit sortable; hero area chart with gradient; platform comparison; recommendation cards (business and analyst views); Marketing Performance priority queue + platform tabs |
| 04-05 | Statistical Insights + Seasonality + Data Health pages | Model accuracy chart; confidence interval visualizations; 12-month progression; methodology sidebar; Seasonality timeline; Data Health sync status; notifications bell + panel |
| 04-06 | Export + notifications + email + polish | SheetJS export (CSV + Excel) for all pages; BullMQ notification worker; Resend data health email; skeleton loading states; mobile responsiveness polish; empty states with quotes |

---

## Sources

### Primary (HIGH confidence)
- ui.shadcn.com/docs/components/chart — ChartContainer API, Recharts integration, gradient area patterns
- ui.shadcn.com/docs/react-19 — React 19 compatibility, react-is override requirement
- ui.shadcn.com/docs/components/sidebar — SidebarProvider, useSidebar, mobile Sheet behavior
- ui.shadcn.com/docs/dark-mode/next — next-themes integration, ThemeProvider setup
- ui.shadcn.com/docs/installation/next — Installation steps for Next.js monorepo
- dndkit.com — useSortable hook, DndContext, SortableContext API
- zustand.docs.pmnd.rs/middlewares/persist — Persist middleware, skipHydration, SSR guidance
- tanstack.com/query/v5/docs — QueryClient singleton pattern, App Router integration
- docs.sheetjs.com — XLSX.utils.json_to_sheet, XLSX.write, browser download
- resend.com/docs/send-with-nextjs — Resend + react-email integration in Next.js

### Secondary (MEDIUM confidence)
- github.com/recharts/recharts/releases — Recharts 3.7.0 current version, v3 stable
- github.com/johnpolacek/date-range-picker-for-shadcn — DateRangePicker with presets pattern
- medium.com — Zustand persist SSR hydration workaround (confirmed against official Zustand docs)
- github.com/recharts/recharts/wiki/3.0-migration-guide — Breaking changes for when shadcn upgrades

### Tertiary (LOW confidence)
- Recommendation math (confidence threshold 0.65, budget headroom 75% of headroom): Derived from Hill saturation theory and existing Phase 3 code. Industry-standard but no authoritative single source for the exact threshold. Mark as tunable constant.
- Brand color extraction approach: No library research done yet; deferred per Open Question 2.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against official shadcn/ui, dnd-kit, TanStack Query, Zustand, SheetJS docs
- Architecture: HIGH — based on actual Phase 3 schema + existing Next.js app structure
- Recommendation math: MEDIUM — derived from Hill saturation parameters in Phase 3 code; exact thresholds need business validation
- Pitfalls: HIGH — React 19/Recharts conflict and Zustand SSR hydration are documented in official sources; rollup row filtering derived from Phase 3 implementation

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (shadcn/ui v3 Recharts upgrade may change chart API; check before planning if >30 days elapsed)
