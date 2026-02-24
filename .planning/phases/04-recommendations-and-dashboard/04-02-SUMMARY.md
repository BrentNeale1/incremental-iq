---
phase: 04-recommendations-and-dashboard
plan: "02"
subsystem: api
tags: [recommendation-engine, hill-curve, drizzle-orm, next-api-routes, typescript, dashboard, notifications]

# Dependency graph
requires:
  - phase: 03-statistical-engine
    provides: incrementality_scores, saturation_estimates tables with Hill curve parameters and confidence scores
  - phase: 04-recommendations-and-dashboard plan 01
    provides: UI foundation, shared layout, DB schema (notifications, user-preferences already created)

provides:
  - Recommendation engine: computeBudgetRecommendation (Hill curve math), classifyRecommendation, generateRecommendations
  - types.ts: Recommendation, HoldoutTestDesign, SeasonalAlert, RecommendationAction, RecommendationConfidenceLevel
  - GET /api/recommendations - typed Recommendation[] sorted by expectedImpact DESC
  - GET /api/dashboard/kpis - aggregated spend/revenue/ROAS with optional comparison period
  - GET /api/dashboard/campaigns - campaign-level + rollup drill-down with level= parameter
  - GET /api/dashboard/incrementality - time series or overview with saturation join
  - GET /api/dashboard/seasonality - upcoming events + historical performance lookup
  - GET /api/dashboard/saturation - Hill curve data + 100-point curve data for chart rendering
  - GET/PATCH /api/notifications - list + mark-read with unreadOnly filter
  - GET/PUT /api/notifications/preferences - upsert notification toggles per type/channel

affects: [04-03-PLAN, 04-04-PLAN, 04-05-PLAN, frontend-pages, dashboard-components]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Explicit TypeScript types on withTenant() calls to prevent implicit any inference
    - Drizzle INNER JOIN campaigns pattern to filter rollup sentinel rows (Pitfall 3)
    - holdoutTestDesign field only populated on low-confidence watch path (RECC-06)
    - Hill function f(x) = alpha * x^gamma / (mu^gamma + x^gamma) for saturation math
    - Scale to 75th percentile of headroom capped at 50% increase pattern
    - Seasonal alerts as non-critical try/catch — don't fail recommendations on seasonal error
    - Multiple sequential withTenant() calls instead of single complex join — simpler, type-safe

key-files:
  created:
    - apps/web/lib/recommendations/types.ts
    - apps/web/lib/recommendations/engine.ts
    - apps/web/lib/recommendations/seasonal.ts
    - apps/web/app/api/recommendations/route.ts
    - apps/web/app/api/dashboard/kpis/route.ts
    - apps/web/app/api/dashboard/campaigns/route.ts
    - apps/web/app/api/dashboard/incrementality/route.ts
    - apps/web/app/api/dashboard/seasonality/route.ts
    - apps/web/app/api/dashboard/saturation/route.ts
    - apps/web/app/api/notifications/route.ts
    - apps/web/app/api/notifications/preferences/route.ts
  modified:
    - packages/db/src/schema/index.ts (already done in 04-01)

key-decisions:
  - "Rollup sentinel rows filtered via INNER JOIN campaigns (not campaignId LIKE 'rollup:%') — INNER JOIN is more robust: rollup rows have pseudo-UUIDs not in campaigns table"
  - "holdoutTestDesign field strictly absent on scale_up action (RECC-06) — engine guarantees this; UI checks field existence to conditionally render holdout option"
  - "Multiple withTenant() calls per generateRecommendations() invocation — avoids complex multi-table joins that cause TypeScript inference issues with drizzle"
  - "Seasonal alerts wrapped in try/catch — non-critical, recommendation list must not fail if seasonal data is unavailable"
  - "Explicit TypeScript row types on withTenant() return annotation — prevents implicit any type errors in strict mode"

patterns-established:
  - "Explicit return type annotation on withTenant<T>() calls: const rows: MyType[] = await withTenant(...) — required for TypeScript strict mode"
  - "Rollup filter pattern: INNER JOIN campaigns on incrementalityScores.campaignId = campaigns.id — excludes sentinel rows without string-matching"
  - "Hill function used for both saturation check and revenue projection from same parameters"

requirements-completed: [RECC-01, RECC-02, RECC-03, RECC-04, RECC-06]

# Metrics
duration: 11min
completed: 2026-02-24
---

# Phase 4 Plan 02: Recommendation Engine and Dashboard API Routes Summary

**Hill curve-based TypeScript recommendation engine with scale-up/watch/investigate classification and 9 typed Next.js API routes consuming Phase 3 statistical outputs**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-24T13:20:43Z
- **Completed:** 2026-02-24T13:31:37Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Recommendation engine reads Phase 3 incrementality scores and saturation estimates, applies Hill curve math to compute specific budget recommendations (e.g., "increase $500/day to $625/day for 3 weeks — expected +$12K incremental revenue")
- Low-confidence campaigns get watch action with nextAnalysisDate (7 days) + holdoutTestDesign as secondary option; holdoutTestDesign field is intentionally absent on scale_up actions (RECC-06)
- All 9 API routes created and type-checked: /api/recommendations, /api/dashboard/kpis, /api/dashboard/campaigns (with level= drill-down), /api/dashboard/incrementality, /api/dashboard/seasonality, /api/dashboard/saturation, /api/notifications, /api/notifications/preferences

## Task Commits

Each task was committed atomically:

1. **Task 1: Recommendation engine with types and seasonal alerts** - `549ac3f` (feat)
2. **Task 2: All dashboard API routes** - `a1269c1` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `apps/web/lib/recommendations/types.ts` - Recommendation, HoldoutTestDesign, SeasonalAlert interfaces
- `apps/web/lib/recommendations/engine.ts` - computeBudgetRecommendation, classifyRecommendation, generateRecommendations
- `apps/web/lib/recommendations/seasonal.ts` - getUpcomingSeasonalAlerts with 8-week window + historical lift
- `apps/web/app/api/recommendations/route.ts` - GET handler returning Recommendation[]
- `apps/web/app/api/dashboard/kpis/route.ts` - GET with from/to + optional compareFrom/compareTo
- `apps/web/app/api/dashboard/campaigns/route.ts` - GET with level= parameter (campaign/cluster/channel/overall)
- `apps/web/app/api/dashboard/incrementality/route.ts` - GET with campaignId (time series) or overview mode
- `apps/web/app/api/dashboard/seasonality/route.ts` - GET returning upcoming events + historical performance
- `apps/web/app/api/dashboard/saturation/route.ts` - GET with 100-point Hill curve data for chart rendering
- `apps/web/app/api/notifications/route.ts` - GET (list) + PATCH (mark-read)
- `apps/web/app/api/notifications/preferences/route.ts` - GET + PUT (upsert)

## Decisions Made

- Rollup sentinel rows filtered via INNER JOIN campaigns (not campaignId LIKE 'rollup:%') — more robust since rollup rows have pseudo-UUIDs not present in the campaigns table at all
- holdoutTestDesign field strictly absent on scale_up action per RECC-06 — engine guarantees this contract; UI checks field existence to conditionally render holdout option
- Multiple withTenant() calls per generateRecommendations() instead of complex single join — avoids TypeScript inference issues with multi-table drizzle queries in strict mode
- Seasonal alerts wrapped in try/catch (non-critical) — recommendation list must succeed even if seasonal data query fails

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit TypeScript types on withTenant() return values**
- **Found during:** Task 1 (recommendation engine)
- **Issue:** TypeScript strict mode inferred `{}` for drizzle query results when withTenant() return type wasn't annotated, causing implicit any errors in downstream map/filter callbacks
- **Fix:** Added explicit `const rows: MyType[] = await withTenant(...)` annotations throughout engine.ts, seasonal.ts, and all API routes
- **Files modified:** All 11 new files
- **Verification:** `npx tsc --noEmit --skipLibCheck` passes with zero errors in our new files
- **Committed in:** 549ac3f, a1269c1

---

**Total deviations:** 1 auto-fixed (1 blocking - TypeScript inference)
**Impact on plan:** Fix required for correct TypeScript compilation. No scope creep.

## Issues Encountered

- TypeScript strict mode requires explicit return type annotations on `withTenant<T>()` calls — Drizzle's type inference via `.select()` is accurate at the query level but the `T` parameter of withTenant needs to be specified explicitly at the call site to avoid inference collapsing to `{}`. Resolved by annotating all withTenant call sites with explicit interface types.

## User Setup Required

None - no external service configuration required. DB schema for notifications and user-preferences was already created in Plan 04-01.

## Next Phase Readiness

- All 9 API endpoints ready for frontend consumption by Plans 03-05
- Recommendation engine produces typed Recommendation[] with all required fields
- /api/dashboard/kpis supports comparison period for KPI delta cards
- /api/dashboard/campaigns level= parameter supports full drill-down hierarchy
- Rollup sentinel rows correctly excluded from campaign-level views in all routes

---
*Phase: 04-recommendations-and-dashboard*
*Completed: 2026-02-24*

## Self-Check: PASSED

All 11 required files verified present. Both task commits verified in git history:
- `549ac3f` — feat(04-02): recommendation engine (Task 1)
- `a1269c1` — feat(04-02): dashboard API routes (Task 2)
