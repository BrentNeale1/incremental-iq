---
phase: 06-authentication
plan: 03
subsystem: auth
tags: [better-auth, tanstack-query, session, idor, tenant-isolation, next-js]

# Dependency graph
requires:
  - phase: 06-01
    provides: Better Auth installation with session.user.tenantId additionalField and TenantProvider context
  - phase: 06-02
    provides: Auth UI pages (login, signup, forgot-password, reset-password) and middleware

provides:
  - All 16 non-OAuth API routes enforce session-based tenant isolation (auth.api.getSession)
  - All TanStack Query hooks no longer accept tenantId — rely on cookie-based session auth
  - All dashboard pages, components, and layout no longer pass tenantId through prop chains
  - IDOR vulnerability eliminated — tenantId cannot be spoofed via query parameter
affects:
  - Future API routes (must follow session-based tenantId pattern)
  - Future React components (must NOT accept tenantId as prop)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API Route Auth Pattern: auth.api.getSession({ headers: await headers() }) → 401 if null → const tenantId = session.user.tenantId"
    - "Client Hook Pattern: no tenantId param, no enabled: !!tenantId guard, session cookie handles auth automatically"
    - "Component Pattern: no tenantId prop, hooks called without tenantId, DashboardLayoutClient passes tenantId only to TenantProvider"

key-files:
  created: []
  modified:
    - apps/web/app/api/dashboard/kpis/route.ts
    - apps/web/app/api/dashboard/campaigns/route.ts
    - apps/web/app/api/dashboard/incrementality/route.ts
    - apps/web/app/api/dashboard/seasonality/route.ts
    - apps/web/app/api/dashboard/saturation/route.ts
    - apps/web/app/api/recommendations/route.ts
    - apps/web/app/api/notifications/route.ts
    - apps/web/app/api/notifications/preferences/route.ts
    - apps/web/app/api/integrations/status/route.ts
    - apps/web/app/api/integrations/[id]/status/route.ts
    - apps/web/app/api/integrations/[id]/sync/route.ts
    - apps/web/app/api/ga4/properties/route.ts
    - apps/web/app/api/ga4/events/route.ts
    - apps/web/app/api/markets/route.ts
    - apps/web/app/api/markets/detect/route.ts
    - apps/web/app/api/tenant/preferences/route.ts
    - apps/web/lib/hooks/useKpis.ts
    - apps/web/lib/hooks/useCampaigns.ts
    - apps/web/lib/hooks/useRecommendations.ts
    - apps/web/lib/hooks/useIncrementality.ts
    - apps/web/lib/hooks/useSaturation.ts
    - apps/web/lib/hooks/useSeasonality.ts
    - apps/web/lib/hooks/useFreshness.ts
    - apps/web/lib/hooks/useSyncHistory.ts
    - apps/web/app/(dashboard)/page.tsx
    - apps/web/app/(dashboard)/performance/page.tsx
    - apps/web/app/(dashboard)/insights/page.tsx
    - apps/web/app/(dashboard)/seasonality/page.tsx
    - apps/web/app/(dashboard)/health/page.tsx
    - apps/web/components/performance/PriorityQueue.tsx
    - apps/web/components/performance/PlatformTabs.tsx
    - apps/web/components/performance/PlatformOverview.tsx
    - apps/web/components/performance/CampaignTable.tsx
    - apps/web/components/insights/DrillDownTable.tsx
    - apps/web/components/notifications/NotificationBell.tsx
    - apps/web/components/notifications/NotificationPanel.tsx
    - apps/web/components/notifications/NotificationSettings.tsx
    - apps/web/components/dashboard/StaleDataBanner.tsx
    - apps/web/components/layout/SidebarNav.tsx
    - apps/web/components/layout/AppHeader.tsx
    - apps/web/components/layout/DashboardLayoutClient.tsx

key-decisions:
  - "OAuth routes excluded — /api/oauth/* routes use their own tenant resolution during pre-auth OAuth flow, not session-based auth"
  - "DashboardLayoutClient still accepts tenantId prop and passes it to TenantProvider only — not to AppHeader, StaleDataBanner, or other children"
  - "PUT body types updated: markets and tenant/preferences routes no longer accept tenantId in request body — eliminates client-supplied tenantId vectors entirely"
  - "health/page.tsx export fix: syncHistory is SyncHistoryData object, not array — export uses syncHistory.integrations"

patterns-established:
  - "API Route Auth: Every non-OAuth route starts with getSession check, 401 if null, tenantId from session.user.tenantId"
  - "Hook Simplicity: Hooks take only domain params (dateRange, campaignId, etc.) — never tenantId"
  - "Component Purity: UI components never receive tenantId as prop — auth is handled at API layer via cookie"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

# Metrics
duration: ~90min (split across 2 sessions due to context limit)
completed: 2026-02-25
---

# Phase 06 Plan 03: Session-Based Tenant Isolation Summary

**Eliminated IDOR vulnerability across all 16 API routes by moving tenantId from client query params to server-side session extraction, and stripped tenantId from all 8 hooks, 5 dashboard pages, and 11 UI components**

## Performance

- **Duration:** ~90 min (split across 2 sessions)
- **Started:** 2026-02-25T (session 1)
- **Completed:** 2026-02-25
- **Tasks:** 2/2
- **Files modified:** 41

## Accomplishments

- All 16 non-OAuth API routes now call `auth.api.getSession()` and return 401 when unauthenticated — tenantId cannot be spoofed via URL query parameter
- All 8 TanStack Query hooks (`useKpis`, `useCampaigns`, `useRecommendations`, `useIncrementality`, `useSaturation`, `useSeasonality`, `useFreshness`, `useSyncHistory`) no longer accept or forward tenantId — session cookie sent automatically by browser
- All 11 UI components (notification bell/panel/settings, stale banner, sidebar nav, app header, platform tabs/overview/table, priority queue, drill-down table) no longer take tenantId as prop

## Task Commits

1. **Task 1: Retrofit API routes to use session-based tenantId** - `490e039` (feat)
2. **Task 2: Remove tenantId from hooks, pages, and UI components** - `adb6d7d` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

### API Routes (Task 1 — 16 files)
- `apps/web/app/api/dashboard/kpis/route.ts` — tenantId from session, 401 on missing session
- `apps/web/app/api/dashboard/campaigns/route.ts` — same pattern
- `apps/web/app/api/dashboard/incrementality/route.ts` — same pattern
- `apps/web/app/api/dashboard/seasonality/route.ts` — same pattern
- `apps/web/app/api/dashboard/saturation/route.ts` — same pattern
- `apps/web/app/api/recommendations/route.ts` — same pattern
- `apps/web/app/api/notifications/route.ts` — GET and PATCH updated
- `apps/web/app/api/notifications/preferences/route.ts` — GET and PUT updated; GET renamed to `_request`
- `apps/web/app/api/integrations/status/route.ts` — was using X-Tenant-Id header, now uses session
- `apps/web/app/api/integrations/[id]/status/route.ts` — same
- `apps/web/app/api/integrations/[id]/sync/route.ts` — same
- `apps/web/app/api/ga4/properties/route.ts` — was using X-Tenant-Id header, now uses session
- `apps/web/app/api/ga4/events/route.ts` — GET and POST updated
- `apps/web/app/api/markets/route.ts` — PUT body no longer accepts tenantId field
- `apps/web/app/api/markets/detect/route.ts` — POST updated
- `apps/web/app/api/tenant/preferences/route.ts` — PUT body no longer accepts tenantId field

### Hooks (Task 2 — 8 files)
All hooks: removed tenantId param, removed from queryKey, removed from URLSearchParams, removed `enabled: !!tenantId` guard.

### Dashboard Pages (Task 2 — 5 files)
All pages: removed useTenantId() calls, updated hook invocations to match new signatures.

### UI Components (Task 2 — 11 files)
- Performance: PriorityQueue, PlatformTabs, PlatformOverview, CampaignTable
- Insights: DrillDownTable
- Notifications: NotificationBell, NotificationPanel, NotificationSettings
- Dashboard: StaleDataBanner
- Layout: SidebarNav, AppHeader

## Decisions Made

- **OAuth routes excluded**: The 4 routes in `apps/web/app/api/oauth/` (`/meta`, `/google`, `/shopify`, `/ga4`) remain as-is — they run during the OAuth initiation flow before a session exists and handle tenant resolution differently.
- **DashboardLayoutClient still receives tenantId**: Passes it only to `<TenantProvider>` for the context API (`useTenantId()`). All other children (AppHeader, StaleDataBanner) now get tenantId through their own hooks.
- **PUT body cleanup**: `markets/route.ts` and `tenant/preferences/route.ts` PUT body types no longer include tenantId field — eliminates all client-supplied tenantId vectors, not just query params.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed health/page.tsx export data type mismatch**
- **Found during:** Task 2 TypeScript compilation check
- **Issue:** `syncHistory.length` caused TS2339 — `syncHistory` is `SyncHistoryData` (an object), not an array. The export call was passing the whole object where an array was expected.
- **Fix:** Changed `syncHistory.length > 0` to `syncHistory?.integrations?.length > 0` and passed `syncHistory.integrations` to `setExportData`
- **Files modified:** `apps/web/app/(dashboard)/health/page.tsx`
- **Verification:** TypeScript error resolved; exports the integrations array as intended
- **Committed in:** `adb6d7d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minor type fix, no scope change. Export behavior now correct.

## Issues Encountered

- **Pre-existing TypeScript errors in packages/db**: The `withTenant` return type resolves to `unknown` because `drizzle-orm` module resolution fails in the db package. This causes downstream TS errors in `markets/route.ts` (instanceof Date check) and `tenant/preferences/route.ts` (rows[0] indexing). These are pre-existing and unrelated to this plan's changes.
- **Context limit mid-execution**: Task 2 was split across two sessions. Previous session completed hooks and most components; this session completed notification components and layout components.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full session-based tenant isolation is now in place across all API routes
- All client-side code is clean of explicit tenantId passing — the cookie handles it automatically
- Ready for Phase 07 or any subsequent feature development that adds new API routes (must follow the session-based pattern established here)
- Pre-existing packages/db drizzle-orm module resolution issue should be addressed in a future maintenance pass

---
*Phase: 06-authentication*
*Completed: 2026-02-25*
