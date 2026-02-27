---
phase: 10-dashboard-polish-and-integration-fixes
plan: "04"
subsystem: insights-ui
tags: [market-filter, drill-down-table, tanstack-query, zustand]
dependency_graph:
  requires: [10-01-SUMMARY.md]
  provides: [DrillDownTable market filtering]
  affects: [apps/web/components/insights/DrillDownTable.tsx, apps/web/app/(dashboard)/insights/page.tsx]
tech_stack:
  added: []
  patterns: [marketId in queryKey for cache-busting, conditional URLSearchParams spread]
key_files:
  created: []
  modified:
    - apps/web/components/insights/DrillDownTable.tsx
    - apps/web/app/(dashboard)/insights/page.tsx
decisions:
  - "marketId in TanStack Query queryKey causes automatic cache-bust when market changes — same pattern as useIncrementality (Plan 10-01)"
  - "Conditional spread ...(marketId ? { marketId } : {}) sends marketId param to API only when a market is selected — omits param for All Markets"
  - "campaigns/route.ts NOT modified — it already reads marketId from searchParams and filters via innerJoin (line 96)"
metrics:
  duration: 2 min
  completed: 2026-02-27
  tasks: 1
  files: 2
---

# Phase 10 Plan 04: DrillDownTable Market Filter Wiring Summary

Wire marketId from page-level Zustand state through DrillDownTable to the /api/dashboard/campaigns API route so campaign drill-down table filters by selected market — matching the stats cards behavior already wired in Plan 10-01.

## What Was Built

Added `marketId` prop wiring from the Statistical Insights page to the `DrillDownTable` component and its internal `useDrillData` hook. When a user selects a market in AppHeader, the Zustand `selectedMarket` value now flows from `insights/page.tsx` → `DrillDownTable` → `useDrillData` → `/api/dashboard/campaigns?marketId=...`.

**Key changes:**

1. `DrillDownTableProps.marketId?: string` — new optional prop on the component interface
2. `useDrillData` fourth parameter `marketId: string | undefined` — hook accepts market context
3. `queryKey: ['drill-down', from, to, platform, level, marketId]` — TanStack Query busts cache when market changes
4. `...(marketId ? { marketId } : {})` — URLSearchParams conditional spread sends marketId to API only when set
5. `DrillDownTable({ dateRange, onSelectRow, marketId })` — component destructures new prop
6. `useDrillData(..., marketId)` — internal hook call passes market context down
7. `insights/page.tsx`: `marketId={selectedMarket ?? undefined}` — passes Zustand value to DrillDownTable

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/components/insights/DrillDownTable.tsx` | Added marketId to props interface, useDrillData signature, queryKey, URLSearchParams, and component function |
| `apps/web/app/(dashboard)/insights/page.tsx` | Added `marketId={selectedMarket ?? undefined}` prop to DrillDownTable usage |

## Verification

- TypeScript: No errors in modified files (pre-existing unrelated errors in signup/markets/ingestion remain out of scope)
- `DrillDownTableProps` includes `marketId?: string` — confirmed
- `useDrillData` queryKey includes `marketId` — confirmed at line 94
- `useDrillData` URLSearchParams includes marketId conditional spread — confirmed at line 101
- `insights/page.tsx` passes `marketId={selectedMarket` — confirmed at line 277
- `campaigns/route.ts` NOT modified — unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 7275f30 | feat(10-04): wire marketId from page Zustand state to DrillDownTable |

## Self-Check: PASSED

- `apps/web/components/insights/DrillDownTable.tsx` — exists, marketId wired correctly
- `apps/web/app/(dashboard)/insights/page.tsx` — exists, marketId prop passed
- Commit 7275f30 — confirmed in git log
