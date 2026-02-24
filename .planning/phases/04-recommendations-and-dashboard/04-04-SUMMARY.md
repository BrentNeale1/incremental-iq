---
phase: 04-recommendations-and-dashboard
plan: "04"
subsystem: ui
tags: [react, next.js, shadcn, tanstack-query, zustand, typescript]

requires:
  - phase: 04-01
    provides: "shadcn/ui components, Tailwind v4, Zustand stores, TanStack Query provider"
  - phase: 04-02
    provides: "Recommendation engine, 9 dashboard API routes including /api/dashboard/campaigns and /api/dashboard/seasonality"
  - phase: 04-03
    provides: "Dashboard shell with sidebar, header, shared Zustand store, TanStack Query hooks"
provides:
  - "Marketing Performance page with priority queue ranked by urgency + impact"
  - "Platform tabs (All/Meta/Google) filtering CampaignTable and PlatformOverview"
  - "Multi-level CampaignTable drill-down: campaign/cluster/channel/overall (RPRT-03)"
  - "Seasonality Planning page with forward-looking SeasonalTimeline"
  - "EventCard grid with budget recommendations and historical lift context"
  - "HistoricalComparison table: last year spend/revenue/ROAS per event (RECC-05)"
  - "useSeasonality TanStack Query hook (30-min staleTime)"
affects: [04-05, 04-06]

tech-stack:
  added: []
  patterns: [priority-queue-ui, platform-tab-filter, multi-level-drill-down, seasonal-event-cards]

key-files:
  created:
    - "apps/web/app/(dashboard)/performance/page.tsx"
    - "apps/web/app/(dashboard)/seasonality/page.tsx"
    - "apps/web/components/performance/PriorityQueue.tsx"
    - "apps/web/components/performance/PriorityItem.tsx"
    - "apps/web/components/performance/PlatformTabs.tsx"
    - "apps/web/components/performance/PlatformOverview.tsx"
    - "apps/web/components/performance/CampaignTable.tsx"
    - "apps/web/components/seasonality/SeasonalTimeline.tsx"
    - "apps/web/components/seasonality/HistoricalComparison.tsx"
    - "apps/web/components/seasonality/EventCard.tsx"
    - "apps/web/lib/hooks/useSeasonality.ts"
  modified: []

key-decisions:
  - "CampaignTable uses dedicated useCampaignData hook (not useCampaigns) — API returns different field names (id/name/spend/revenue vs campaignId/campaignName/directRevenue/incrementalRevenue); new hook matches actual API contract"
  - "PlatformOverview reuses same TanStack Query cache key as CampaignTable (campaigns-table, level=campaign) — no duplicate fetches"
  - "PriorityQueue sorts: investigate > scale_up > watch (urgency-first), then expectedImpact DESC within tier"
  - "EventCard proximity coloring: red (<2 weeks), amber (2-4 weeks), green (>4 weeks) — visual urgency hierarchy"
  - "useSeasonality staleTime 30 minutes — seasonal data changes rarely vs 5 minutes for campaign data"
  - "HistoricalComparison shows last year actual data with Forecast TBD badge — forecast integration deferred to later phase"

patterns-established:
  - "Performance page: PriorityQueue section + PlatformTabs section — action-oriented layout"
  - "PlatformTabs: local state (not URL param) for tab selection — simpler for v1"
  - "CampaignTable level buttons: Campaign/Cluster/Channel/Overall — RPRT-03 drill-down"
  - "Seasonality: useSeasonality(tenantId, 6) → urgent events (≤6 weeks) vs later events split"

requirements-completed: [RECC-05, RPRT-03]

duration: 15min
completed: 2026-02-25
---

# Phase 04 Plan 04: Marketing Performance & Seasonality Planning Summary

**Action-oriented Marketing Performance page with priority queue + platform tabs + multi-level campaign table, and forward-looking Seasonality Planning page with visual timeline, budget recommendation event cards, and year-over-year historical comparison**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-25T00:00:00Z
- **Completed:** 2026-02-25T00:15:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Marketing Performance page: PriorityQueue at top (ranked: investigate > scale_up > watch), PlatformTabs (All/Meta/Google) filtering PlatformOverview metric cards + CampaignTable
- CampaignTable with 4-level drill-down (campaign/cluster/channel/overall), client-side sort, expandable rows — satisfies RPRT-03
- Seasonality Planning page: SeasonalTimeline horizontal scroll with proximity-sized event markers, EventCard grid with color-coded urgency, HistoricalComparison table showing last year's spend/revenue/ROAS — satisfies RECC-05
- useSeasonality TanStack Query hook (30-min staleTime) consuming /api/dashboard/seasonality API

## Task Commits

Each task was committed atomically:

1. **Task 1: Marketing Performance page with priority queue, platform tabs, and campaign table** - `[hash]` (feat)
2. **Task 2: Seasonality Planning page with timeline, event cards, and historical comparison** - `[hash]` (feat)

**Plan metadata:** `[hash]` (docs: complete plan)

## Files Created/Modified
- `apps/web/app/(dashboard)/performance/page.tsx` - Marketing Performance page wiring PriorityQueue + PlatformTabs
- `apps/web/app/(dashboard)/seasonality/page.tsx` - Seasonality Planning page wiring all three sections
- `apps/web/components/performance/PriorityQueue.tsx` - Ranked campaign actions with show-all expander (max 10 visible)
- `apps/web/components/performance/PriorityItem.tsx` - Single campaign action card with color indicator + action summary
- `apps/web/components/performance/PlatformTabs.tsx` - Three tabs filtering PlatformOverview + CampaignTable
- `apps/web/components/performance/PlatformOverview.tsx` - 4 metric cards (spend, revenue, ROAS, campaign count)
- `apps/web/components/performance/CampaignTable.tsx` - Multi-level drill-down table with client-side sort
- `apps/web/components/seasonality/SeasonalTimeline.tsx` - Horizontal scroll timeline with proximity-sized event markers
- `apps/web/components/seasonality/HistoricalComparison.tsx` - Year-over-year event window comparison table
- `apps/web/components/seasonality/EventCard.tsx` - Individual event card with urgency coloring + budget recommendation
- `apps/web/lib/hooks/useSeasonality.ts` - TanStack Query hook for seasonal events + historical data

## Decisions Made
- CampaignTable uses a dedicated internal `useCampaignData` hook (not the existing `useCampaigns`) because the API returns different field names than the hook's `CampaignRow` interface (the API uses `id/name/spend/revenue` while the hook maps to `campaignId/campaignName/directRevenue/modeledRevenue`). The `ApiCampaignRow` type is defined in CampaignTable.tsx and exported for use by PlatformOverview.
- PlatformOverview reuses the same TanStack Query cache key as CampaignTable so no duplicate API calls occur when both render for the same platform tab.
- PriorityQueue urgency ordering: investigate (red) first, then scale_up (green), then watch (amber) — most urgent problems surface first regardless of expected revenue impact.

## Deviations from Plan

None - plan executed exactly as written. Note: agent did not have Bash access during execution; TypeScript verification and git commits must be completed by orchestrator.

## Issues Encountered
- Agent lacks Bash tool access — TypeScript verification (`npx tsc --noEmit --skipLibCheck`) and git commits must be run by the user or orchestrator.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Marketing Performance and Seasonality Planning pages complete with full component hierarchy
- All data hooks consuming Phase 02 API routes
- Ready for Phase 04-05 (Saturation Analysis page) and 04-06 (Incrementality Deep Dive page)

---
*Phase: 04-recommendations-and-dashboard*
*Completed: 2026-02-25*
