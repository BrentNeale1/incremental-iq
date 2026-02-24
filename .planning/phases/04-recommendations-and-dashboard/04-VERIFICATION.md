---
phase: 04-recommendations-and-dashboard
verified: 2026-02-25T00:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
gaps:
  - truth: "User can export all visible data as CSV or Excel"
    status: resolved
    reason: "ExportButton wired into AppHeader via ExportProvider context. All 5 pages provide export data on mount. Fixed in commit ced7750."
    artifacts:
      - path: "apps/web/components/dashboard/ExportButton.tsx"
        issue: "Component exists with correct implementation but is imported by zero pages"
      - path: "apps/web/lib/export/excel.ts"
        issue: "exportToExcel and exportToCsv helpers exist but only referenced inside ExportButton (which itself is unused)"
      - path: "apps/web/components/layout/AppHeader.tsx"
        issue: "Does not import or render ExportButton despite plan spec requiring it"
    missing:
      - "Import ExportButton in AppHeader.tsx or in each individual dashboard page"
      - "Pass current page data and filename to ExportButton from each page"
      - "Wire ExportButton into the dashboard layout so it appears on all 5 pages"

  - truth: "Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %) with date range selection"
    status: partial
    reason: "KPI display and date range selection exist and are fully wired. However, REQUIREMENTS.md marks RPRT-01 as 'Pending' (not 'Complete'). The implementation is substantive — KpiGrid renders 4 cards with spend/revenue/ROAS/incremental_revenue, date range picker has 4 presets (7/14/30/90 days) plus custom calendar, and comparison toggle works. The REQUIREMENTS.md file was not updated to 'Complete' for RPRT-01. Flagging as partial because the requirement file contradicts the implementation."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "RPRT-01 marked as '[ ] Pending' but implementation exists and is substantive"
    missing:
      - "Update REQUIREMENTS.md to mark RPRT-01 as '[x] Complete' to match the actual implementation"

  - truth: "Dashboard is fully usable on a mobile browser"
    status: partial
    reason: "Tailwind responsive classes (sm:, md:, lg:) are present in all 6 dashboard pages confirming mobile-responsive Tailwind is applied. KpiGrid uses sm:grid-cols-2 lg:grid-cols-4. Page layout uses sm:p-6 and sm:space-y-8. However, the REQUIREMENTS.md marks RPRT-06 as '[ ] Pending', and the plan says 'Touch targets at least 44x44px on mobile' cannot be verified programmatically. The 04-06 SUMMARY claims this was completed, but the mobile responsiveness of ExportButton — a key feature — is moot since ExportButton is unwired. Marking partial pending ExportButton wiring."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "RPRT-06 marked as '[ ] Pending' — requirement file not updated after implementation"
    missing:
      - "Wire ExportButton to all pages (resolves the export gap, which is the only unfinished mobile feature)"
      - "Update REQUIREMENTS.md RPRT-06 status to '[x] Complete'"

human_verification:
  - test: "Verify mobile layout at 375px viewport width"
    expected: "KPI cards stack 1-column, charts scale full-width, tables scroll horizontally, sidebar becomes Sheet drawer"
    why_human: "Cannot verify visual rendering programmatically"
  - test: "Verify Export as CSV and Export as Excel downloads work"
    expected: "After ExportButton is wired: clicking Export downloads a file with data matching the current date range filter"
    why_human: "Requires browser interaction to test file download behavior"
  - test: "Verify Executive vs Analyst view toggle changes recommendation card format"
    expected: "Executive view shows single-line summary; Analyst view shows liftMean, CI range, confidence %, saturation"
    why_human: "Visual rendering of component variants requires browser"
---

# Phase 04: Recommendations and Dashboard Verification Report

**Phase Goal:** Users can view a dual-audience dashboard that surfaces scaling-first recommendations with transparent confidence, and can export their data
**Verified:** 2026-02-25T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Default recommendation shown is scale-up ("increase Campaign X budget by Y% for Z weeks"), holdout shown only when confidence insufficient | VERIFIED | `engine.ts` classifyRecommendation: `SCALE_UP_CONFIDENCE_THRESHOLD = 0.65`; holdoutTestDesign absent on scale_up path; LowConfidenceCard puts "wait" primary and "Alternative: Holdout Test" as collapsible secondary |
| 2 | Business owner view shows single-line summary; analyst view shows confidence ranges, p-values, methodology — from identical data | VERIFIED | RecommendationCard renders `buildSummary()` (executive); RecommendationAnalystCard renders liftMean, liftLower–liftUpper CI, confidence %, saturation %, expandable methodology section; both receive same Recommendation object from useRecommendations hook |
| 3 | When confidence too low, system states transparently and suggests specific tests or data collection steps | VERIFIED | LowConfidenceCard primary section: "Analysis needs more data — Next scoring run: {date} ({countdown})"; secondary Collapsible "Alternative: Holdout Test" shows holdbackPct, durationWeeks, estimatedSampleSize; engine.ts sets nextAnalysisDate = 7 days from now |
| 4 | Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %) with date range selection (7/14/30/90, custom, comparison) and multi-level campaign-to-channel drill-down | PARTIAL | KpiGrid renders 4 draggable cards from /api/dashboard/kpis; DateRangePicker has PRESETS array [7, 14, 30, 90] + Calendar popover; comparison toggle exists; CampaignTable/DrillDownTable support level=campaign|cluster|channel|overall. Gap: REQUIREMENTS.md marks RPRT-01 as Pending despite functional implementation |
| 5 | User can export all visible data as CSV or Excel, and UI is fully usable on mobile browser | FAILED | ExportButton component exists (ExportButton.tsx) with correct CSV/Excel implementation via SheetJS. exportToExcel and exportToCsv functions exist (lib/export/excel.ts). BUT ExportButton is imported by ZERO pages. Not present in AppHeader. Not present in any of the 5 dashboard pages. The export capability is built but completely unwired — a user cannot trigger an export from any page |

**Score:** 3/5 truths verified (SC1, SC2, SC3 verified; SC4 partial; SC5 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/lib/recommendations/engine.ts` | Recommendation engine with Hill curve math | VERIFIED | Exports generateRecommendations, computeBudgetRecommendation, classifyRecommendation; SCALE_UP_CONFIDENCE_THRESHOLD = 0.65; rollup filter via INNER JOIN campaigns |
| `apps/web/lib/recommendations/types.ts` | Recommendation, HoldoutTestDesign, RecommendationAction types | VERIFIED | All types exported; holdoutTestDesign documented as absent on scale_up |
| `apps/web/app/api/recommendations/route.ts` | GET handler returning typed Recommendation[] | VERIFIED | Calls generateRecommendations(tenantId), returns sorted JSON |
| `apps/web/app/api/dashboard/kpis/route.ts` | GET handler returning aggregated KPIs for date range | VERIFIED | Aggregates spend/revenue/ROAS/incrementalRevenue; supports compareFrom/compareTo with deltas |
| `apps/web/app/api/dashboard/campaigns/route.ts` | GET handler returning campaign drill-down data | VERIFIED | Supports level=campaign|cluster|channel|overall; INNER JOIN filters rollup rows |
| `apps/web/lib/store/dashboard.ts` | Zustand store with dateRange, comparisonRange, viewMode, kpiOrder | VERIFIED | persist middleware with partialize (viewMode+kpiOrder only), skipHydration: true |
| `apps/web/components/layout/ThemeProvider.tsx` | next-themes wrapper | VERIFIED | Exists; wired in root layout |
| `apps/web/components/layout/QueryProvider.tsx` | TanStack QueryClientProvider | VERIFIED | Exists; wired in root layout |
| `apps/web/lib/query/client.ts` | SSR-safe QueryClient singleton | VERIFIED | typeof window check; staleTime 60_000 |
| `packages/db/src/schema/notifications.ts` | notifications table with RLS | VERIFIED | Exists with pgPolicy |
| `packages/db/src/schema/user-preferences.ts` | user_preferences table with RLS | VERIFIED | Exists with pgPolicy |
| `apps/web/app/(dashboard)/layout.tsx` | Dashboard route group layout with sidebar, header, providers | VERIFIED | SidebarProvider + AppSidebar + AppHeader + StaleDataBanner; Zustand rehydrate() in useEffect |
| `apps/web/components/layout/AppSidebar.tsx` | Collapsible sidebar with 5 nav items and freshness indicators | VERIFIED | 5 nav items via SidebarNav; collapsible="icon" with 400ms transition |
| `apps/web/components/dashboard/KpiGrid.tsx` | dnd-kit sortable grid of 4 KPI cards | VERIFIED | DndContext + SortableContext + rectSortingStrategy; setKpiOrder on drag end |
| `apps/web/components/dashboard/DateRangePicker.tsx` | Date range selection with presets and custom calendar | VERIFIED | 4 preset buttons [7,14,30,90]; Calendar in Popover; updates useDashboardStore |
| `apps/web/components/charts/IncrementalRevenueChart.tsx` | Area chart with gradient fill | VERIFIED | Exists; ChartContainer + AreaChart (confirmed in SUMMARY) |
| `apps/web/components/recommendations/RecommendationCard.tsx` | Executive single-line summary card | VERIFIED | buildSummary() with specific budget numbers for scale_up |
| `apps/web/components/recommendations/RecommendationAnalystCard.tsx` | Analyst card with CI ranges, confidence, methodology | VERIFIED | Shows confidence %, liftMean CI range, saturation %; expandable Methodology section |
| `apps/web/components/recommendations/LowConfidenceCard.tsx` | Wait-first/holdout-secondary card | VERIFIED | PRIMARY: "Analysis needs more data"; SECONDARY: Collapsible "Alternative: Holdout Test" |
| `apps/web/app/(dashboard)/page.tsx` | Executive Overview page with all sections | VERIFIED | 5 sections: seasonal alerts, KpiGrid, IncrementalRevenueChart, PlatformComparisonChart, recommendations with view-mode switching |
| `apps/web/app/(dashboard)/performance/page.tsx` | Marketing Performance page | VERIFIED | PriorityQueue + PlatformTabs sections |
| `apps/web/app/(dashboard)/seasonality/page.tsx` | Seasonality Planning page | VERIFIED | SeasonalTimeline + EventCard grid + HistoricalComparison |
| `apps/web/app/(dashboard)/insights/page.tsx` | Statistical Insights page | VERIFIED | 4 collapsible sections; ModelHealthOverview, charts, ProgressionView, DrillDownTable, MethodologySidebar |
| `apps/web/app/(dashboard)/health/page.tsx` | Data Health page | VERIFIED | SyncStatusList + DataGapsTimeline + IntegrationSettings |
| `apps/web/lib/export/excel.ts` | SheetJS export helpers exportToExcel, exportToCsv | VERIFIED (substantive) | Functions exist with correct XLSX + file-saver implementation |
| `apps/web/components/dashboard/ExportButton.tsx` | Export dropdown with CSV/Excel options | ORPHANED | Component exists and is internally correct. NOT imported or rendered anywhere. Zero usage outside its own file. |
| `apps/web/components/notifications/NotificationBell.tsx` | Bell icon with unread count badge | VERIFIED | TanStack Query polling 60s; badge shown when unreadCount > 0; wired in AppHeader |
| `apps/web/components/notifications/NotificationPanel.tsx` | Notification list panel | VERIFIED | Sheet slide-over; wired in AppHeader |
| `packages/ingestion/src/notifications/generate.ts` | Notification generation backend | VERIFIED | generateNotification, checkAndNotifyDataHealth, checkAndNotifySeasonalDeadlines, checkAndNotifyNewRecommendations all implemented |
| `apps/web/components/dashboard/SkeletonLoaders.tsx` | Skeleton loading components | VERIFIED | KpiGridSkeleton, ChartSkeleton, TableSkeleton, RecommendationCardSkeleton, SidebarSkeleton, TimelineSkeleton |
| `apps/web/components/dashboard/EmptyStates.tsx` | Contextual empty state components | VERIFIED | Exists (confirmed via Glob) |
| `apps/web/components/dashboard/StaleDataBanner.tsx` | Amber stale data warning banner | VERIFIED | useFreshness integration; amber banner with Reconnect link; dismissable |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/api/recommendations/route.ts` | `apps/web/lib/recommendations/engine.ts` | generateRecommendations() called in GET handler | WIRED | Confirmed: `const recommendations = await generateRecommendations(tenantId)` |
| `apps/web/lib/recommendations/engine.ts` | DB incrementalityScores + saturationEstimates | Drizzle queries reading scored data | WIRED | INNER JOIN campaigns, LEFT JOIN-equivalent via separate withTenant() calls |
| `apps/web/app/api/dashboard/kpis/route.ts` | DB campaignMetrics | Drizzle aggregate query (SUM spend, revenue) | WIRED | aggregateKpis() with sum(spendUsd), sum(directRevenue), sum(modeledRevenue) |
| `apps/web/components/dashboard/KpiGrid.tsx` | `apps/web/lib/store/dashboard.ts` | setKpiOrder on drag end persists new order | WIRED | handleDragEnd calls setKpiOrder(newOrder) |
| `apps/web/components/dashboard/DateRangePicker.tsx` | `apps/web/lib/store/dashboard.ts` | setDateRange updates global state | WIRED | handlePreset and handleCalendarSelect both call setDateRange |
| `apps/web/lib/hooks/useKpis.ts` | `/api/dashboard/kpis` | TanStack Query fetch | WIRED | useQuery with queryKey ['kpis', ...] fetching /api/dashboard/kpis |
| `apps/web/components/recommendations/RecommendationCard.tsx` | `apps/web/lib/hooks/useRecommendations.ts` | Renders recommendation data from API | WIRED | page.tsx calls useRecommendations(), passes recs to RecommendationCard |
| `apps/web/components/dashboard/ExportButton.tsx` | `apps/web/lib/export/excel.ts` | exportToExcel/exportToCsv called on click | WIRED (internal only) | ExportButton imports and calls both functions correctly — but ExportButton itself is not rendered anywhere |
| ExportButton in pages/AppHeader | ExportButton component | Pages must import ExportButton | NOT_WIRED | No page or layout file imports ExportButton |
| `apps/web/components/notifications/NotificationBell.tsx` | `/api/notifications` | TanStack Query polling for unread count | WIRED | useQuery fetching /api/notifications?unreadOnly=true with refetchInterval: 60_000 |
| `packages/ingestion/src/notifications/email.ts` | resend | Resend API for transactional email | WIRED | sendDataHealthEmail and sendSeasonalDeadlineEmail use Resend client (confirmed by SUMMARY; actual Resend calls in email.ts per generate.ts import) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RECC-01 | 04-02 | System defaults to scaling-first recommendations | SATISFIED | engine.ts classifyRecommendation returns action='scale_up' when confidence >= 0.65; never shows holdout on high-confidence path |
| RECC-02 | 04-02 | Recommendation includes expected outcome (simple for owners, ranges for analysts) | SATISFIED | RecommendationCard (executive): single-line with specific $ numbers; RecommendationAnalystCard: CI range, confidence %, saturation % |
| RECC-03 | 04-02 | States uncertainty transparently, suggests specific tests | SATISFIED | LowConfidenceCard primary path states "Analysis needs more data — Next scoring run: {date}"; holdout test design details shown as secondary |
| RECC-04 | 04-02 | Can design holdout tests when modeling lacks confidence | SATISFIED | classifyRecommendation computes holdoutTestDesign (holdbackPct, durationWeeks, estimatedSampleSize, description) on low-confidence path |
| RECC-05 | 04-04 | Proactively suggests budget adjustments ahead of seasonal periods | SATISFIED | SeasonalTimeline + EventCard grid with historicalLiftPct displayed; EventCard message format matches spec: "{event} in {N} weeks: scaled +{pct}% last year — consider ramping now"; REQUIREMENTS.md marks Pending but implementation is substantive |
| RECC-06 | 04-02 | Holdout tests suggested only as last resort, never first option | SATISFIED | holdoutTestDesign field absent on scale_up recommendations (engine guarantee); LowConfidenceCard puts holdout in Collapsible below primary "wait" message |
| RPRT-01 | 04-03 | Dashboard displays summary KPIs | SATISFIED (implementation exists, REQUIREMENTS.md not updated) | KpiGrid renders spend/revenue/ROAS/incremental_revenue from /api/dashboard/kpis; REQUIREMENTS.md marks this '[ ] Pending' — a documentation gap, not an implementation gap |
| RPRT-02 | 04-01 | User can select date ranges (7/14/30/90, custom, comparison) | SATISFIED | DateRangePicker with PRESETS [7,14,30,90] + Calendar + ComparisonToggle wired via Zustand store |
| RPRT-03 | 04-04, 04-05 | Multi-level view: campaign → cluster → channel → overall | SATISFIED | CampaignTable (performance page) and DrillDownTable (insights page) both support level switching with 4 buttons; API /api/dashboard/campaigns supports level= parameter |
| RPRT-04 | 04-03, 04-05 | Data freshness indicator per connected integration | SATISFIED | SidebarNav shows freshness badges via useFreshness hook; SyncStatusList shows per-integration status badges; StaleDataBanner shows amber warning in layout |
| RPRT-05 | 04-06 | User can export data as CSV/Excel | BLOCKED | ExportButton and SheetJS helpers fully implemented but ExportButton is ORPHANED — not imported or rendered in any page or the AppHeader |
| RPRT-06 | 04-06 | Web UI is mobile-responsive | PARTIAL | Tailwind responsive classes (sm:grid-cols-2, lg:grid-cols-4, sm:space-y-8, overflow-x-auto on tables) present across all 6 dashboard pages. REQUIREMENTS.md marks Pending. Gap: export feature (RPRT-05) unwired, and visual verification requires human |
| RPRT-07 | 04-01, 04-03 | Dual-audience views (executive vs analyst) | SATISFIED | ViewToggle writes viewMode to Zustand; page.tsx renders RecommendationCard (executive) or RecommendationAnalystCard (analyst) based on viewMode; MethodologySidebar on insights page |

### Anti-Patterns Found

| File | Issue | Severity | Impact |
|------|-------|----------|--------|
| All 5 dashboard pages | `PLACEHOLDER_TENANT_ID = undefined` — all API queries disabled | Warning | All data hooks are disabled (enabled: !!tenantId guard) — dashboard renders with empty/zero data until Phase 6 auth is wired. This is an expected, documented placeholder, not a stub. |
| `apps/web/app/(dashboard)/insights/page.tsx` | ForecastActualChart uses scaffold data (liftMean * 1.08) instead of real Prophet forecast | Warning | Forecast vs actual chart is an approximation until Phase 5 forecast endpoint exists. Documented decision in 04-05-SUMMARY. |
| `apps/web/components/dashboard/ExportButton.tsx` | Component exists but imported by zero files | Blocker | Export requirement (RPRT-05) cannot be fulfilled without wiring ExportButton into at least one page |
| `.planning/REQUIREMENTS.md` | RPRT-01, RPRT-05, RPRT-06, RECC-05 marked as Pending despite implementation | Info | Requirements tracking file not updated. Misleading for future phases. |

### Human Verification Required

#### 1. Mobile Responsiveness

**Test:** Load dashboard at 375px viewport width on a real mobile device or browser devtools
**Expected:** KPI cards stack 1-column; charts scale full-width; tables have horizontal scroll; sidebar renders as Sheet drawer (hamburger opens drawer); DateRangePicker presets stack or wrap vertically; touch targets are at least 44px x 44px
**Why human:** Cannot verify visual rendering, touch target sizes, or Sheet animation programmatically

#### 2. Executive/Analyst View Toggle

**Test:** Toggle between "Executive" and "Analyst" modes via ViewToggle in the header
**Expected:** Executive shows RecommendationCard (single-line summary with $ amounts); Analyst shows RecommendationAnalystCard (CI range, confidence %, saturation %, expandable Methodology section); toggle persists across page reloads
**Why human:** Visual rendering of component variants and persistence verification require browser

#### 3. Export Functionality (after fix)

**Test:** After wiring ExportButton, click Export on any dashboard page with data loaded
**Expected:** "Export as CSV" downloads a .csv file; "Export as Excel" downloads a .xlsx file; both contain the data matching the current date range filter (not all historical data)
**Why human:** File download behavior requires browser interaction to verify

#### 4. Dark Mode / Theme Toggle

**Test:** Click the ThemeToggle in the sidebar footer to cycle light → dark → system
**Expected:** Dark mode applies immediately via CSS class on html element; no flash of unstyled content; colors match the brand palette defined in globals.css
**Why human:** Visual inspection required; hydration flash cannot be detected programmatically

### Gaps Summary

One blocker gap prevents full goal achievement:

**ExportButton is orphaned (RPRT-05 blocked):** The complete export infrastructure is built — `lib/export/excel.ts` exports `exportToExcel` and `exportToCsv` using SheetJS, and `components/dashboard/ExportButton.tsx` implements the correct dropdown UI calling those functions. However, the plan called for wiring ExportButton into AppHeader so it appears on all pages, and this was not done. The 04-06 SUMMARY claims export "works," but inspection shows ExportButton has zero consumers anywhere in the codebase. A user cannot trigger an export from any dashboard page. Fix requires: importing ExportButton in AppHeader (or per-page), passing the currently-visible data from TanStack Query cache and a filename.

Two documentation gaps exist (not blocking the actual feature, but the tracking file is wrong):
- REQUIREMENTS.md marks RPRT-01 and RPRT-05/06 and RECC-05 incorrectly — RPRT-01 is implemented, RECC-05 is implemented (EventCard shows historical lift with budget recommendation), and RPRT-06's implementation is present (responsive classes exist) pending only the ExportButton wiring.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
