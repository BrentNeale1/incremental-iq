---
phase: 07-onboarding-and-connect
plan: 01
subsystem: onboarding
tags: [db-migration, api-routes, oauth, session-auth, bug-fix]
dependency_graph:
  requires:
    - packages/db/src/schema/tenants.ts
    - apps/web/app/api/oauth/meta/callback/route.ts
    - apps/web/app/api/oauth/google/callback/route.ts
    - apps/web/app/api/oauth/shopify/callback/route.ts
    - apps/web/app/api/oauth/ga4/callback/route.ts
    - apps/web/components/onboarding/GA4EventSelector.tsx
    - apps/web/components/onboarding/MarketConfirmationStep.tsx
  provides:
    - packages/db/migrations/0007_onboarding.sql
    - apps/web/app/api/onboarding/status/route.ts
    - apps/web/app/api/onboarding/complete/route.ts
    - apps/web/app/(dashboard)/layout.tsx (onboarding gate)
    - apps/web/components/ui/checkbox.tsx
  affects:
    - All dashboard routes (now gated by onboarding check)
    - OAuth popup flow (callbacks now send HTML with postMessage)
    - MarketConfirmationStep/OutcomeModeSelector callers (tenantId prop removed)
tech_stack:
  added: []
  patterns:
    - Drizzle direct db.select/db.update (no withTenant) for tenants table — no RLS on root isolation table
    - withTenant() for integrations and markets queries — RLS-gated tables
    - OAuth popup-close pattern — HTML response with window.opener.postMessage() and window.close()
    - Session-based auth — all client components use session cookie, not tenantId prop
key_files:
  created:
    - packages/db/migrations/0007_onboarding.sql
    - apps/web/app/api/onboarding/status/route.ts
    - apps/web/app/api/onboarding/complete/route.ts
    - apps/web/components/ui/checkbox.tsx
  modified:
    - packages/db/src/schema/tenants.ts
    - packages/db/migrations/meta/_journal.json
    - apps/web/app/(dashboard)/layout.tsx
    - apps/web/components/onboarding/GA4EventSelector.tsx
    - apps/web/components/onboarding/MarketConfirmationStep.tsx
    - apps/web/components/onboarding/OutcomeModeSelector.tsx
    - apps/web/app/api/oauth/meta/callback/route.ts
    - apps/web/app/api/oauth/google/callback/route.ts
    - apps/web/app/api/oauth/shopify/callback/route.ts
    - apps/web/app/api/oauth/ga4/callback/route.ts
decisions:
  - "tenants table queried with db.select (no withTenant) in status and complete routes — consistent with dashboard layout and Phase 6 pattern: tenants has no RLS"
  - "MarketConfirmationStep Props interface has comment explaining absence of tenantId rather than empty interface — communicates session-auth intent"
  - "Added checkbox.tsx UI component (auto-fix Rule 3) — missing component blocked GA4EventSelector TypeScript compilation; radix-ui package already installed"
metrics:
  duration: "5 minutes"
  completed_date: "2026-02-25"
  tasks_completed: 2
  files_modified: 11
  files_created: 4
---

# Phase 07 Plan 01: Onboarding Backend Foundation Summary

**One-liner:** DB migration adding onboarding_completed column, two new API routes for wizard state and completion, dashboard gate redirecting non-onboarded users, GA4EventSelector response shape fix, OAuth popup-close HTML pattern on all 4 callbacks, and session-auth cleanup on MarketConfirmationStep and OutcomeModeSelector.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB schema, migration, onboarding API routes, dashboard gate | 5fbe8c3 | tenants.ts, 0007_onboarding.sql, _journal.json, status/route.ts, complete/route.ts, layout.tsx |
| 2 | GA4EventSelector bugs, OAuth popup pattern, MarketConfirmationStep session auth | ec947d5 | GA4EventSelector.tsx, MarketConfirmationStep.tsx, OutcomeModeSelector.tsx, checkbox.tsx, 4x OAuth callbacks |

## What Was Built

**DB layer:**
- Added `onboardingCompleted` (boolean, default false, NOT NULL) and `onboardingCompletedAt` (timestamptz, nullable) to `packages/db/src/schema/tenants.ts`
- Created `packages/db/migrations/0007_onboarding.sql` with two ALTER TABLE statements
- Updated `_journal.json` with idx 7 entry for 0007_onboarding (journal now has 8 entries, idx 0-7)

**API routes:**
- `GET /api/onboarding/status` — returns `{ completed, connectedPlatforms, ga4EventsSelected, marketsConfirmed, outcomeMode, suggestedStep }` with derived step logic (1=no platforms, 2=GA4 no events, 3=markets unconfirmed, 4=ready)
- `POST /api/onboarding/complete` — sets `onboardingCompleted=true` and `onboardingCompletedAt=now()` on the tenant row

**Dashboard gate:**
- `apps/web/app/(dashboard)/layout.tsx` now queries `tenants.onboardingCompleted` after session validation. If false, redirects to `/onboarding`. Uses `db.select` (not withTenant) per the no-RLS rule for the tenants table.

**Component fixes:**
- `GA4EventSelector.tsx` — fixed response shape: now parses `{ events: KeyEvent[] }` instead of treating the response as `KeyEvent[]` directly
- `MarketConfirmationStep.tsx` — removed `tenantId` from Props; `fetch('/api/markets')` instead of `/api/markets?tenantId=${tenantId}`; removed tenantId from all PUT bodies
- `OutcomeModeSelector.tsx` — removed `tenantId` from Props and PUT body; session cookie handles auth

**OAuth popup pattern (all 4 callbacks):**
- `meta/callback`, `google/callback`, `shopify/callback`, `ga4/callback` — success response changed from `NextResponse.json({...})` to `new NextResponse(successHtml, { 'Content-Type': 'text/html' })` with embedded JavaScript that calls `window.opener.postMessage(data, window.location.origin)` and `window.close()`
- Error responses (400, 401, 403, 500, 502) remain as JSON — acceptable because the popup is user-facing and shows the error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing @/components/ui/checkbox component**
- **Found during:** Task 2 (GA4EventSelector already imported it; TypeScript error on build)
- **Issue:** `@/components/ui/checkbox` was imported by GA4EventSelector but the file didn't exist in the UI component library. TypeScript error `TS2307: Cannot find module '@/components/ui/checkbox'`
- **Fix:** Created `apps/web/components/ui/checkbox.tsx` following the exact same shadcn/radix-ui pattern as the existing `switch.tsx` — uses `radix-ui` unified package's `Checkbox` export with shadcn styling
- **Files modified:** `apps/web/components/ui/checkbox.tsx` (created)
- **Commit:** ec947d5

## Verification Results

1. TypeScript compilation: 21 pre-existing errors in 9 out-of-scope files (signup/actions.ts, markets/route.ts, emails, hooks, packages/ingestion scoring). Zero errors in any file created or modified by this plan.
2. Migration file `packages/db/migrations/0007_onboarding.sql` exists with ALTER TABLE statements
3. `_journal.json` has 8 entries (idx 0-7) including new idx 7 entry
4. `GET /api/onboarding/status` route file exists with session auth and full state derivation
5. `POST /api/onboarding/complete` route file exists with session auth
6. Dashboard layout contains onboarding gate redirect at `/onboarding`
7. GA4EventSelector accesses `data.events` (lines 29-30)
8. All 4 OAuth callback files contain `window.opener.postMessage` (confirmed 4 files)
9. MarketConfirmationStep Props interface has no `tenantId` field

## Self-Check: PASSED
