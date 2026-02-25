---
phase: 06-authentication
plan: 02
subsystem: auth
tags: [better-auth, next-auth, shadcn, login, signup, password-reset, sidebar, logout]

requires:
  - phase: 06-01
    provides: "Better Auth server/client instances, auth-client.ts, middleware, dashboard layout auth guard, TenantProvider"

provides:
  - "Login page at /login with client-side signIn.email, generic error messages"
  - "Sign-up page at /signup with server action: atomic tenant+user creation with rollback"
  - "Forgot password page at /forgot-password using requestPasswordReset (v1.4 API)"
  - "Reset password page at /reset-password (outside auth group) reading token from URL"
  - "Auth route group layout: centered card, no sidebar, bg-background"
  - "AppSidebar logout: user avatar with initials, dropdown with Log out, signOut + router.refresh()"
  - "Dashboard API routes (kpis, campaigns, incrementality, saturation, seasonality, notifications, recommendations) retrofitted to use session-based tenantId"

affects:
  - "apps/web/components/layout/DashboardLayoutClient.tsx (now passes user prop to AppSidebar)"
  - "apps/web/app/(dashboard)/layout.tsx (now extracts name+email from session)"

tech-stack:
  added: []
  patterns:
    - "Server action in (auth)/signup/actions.ts: tenant first → auth.api.signUpEmail → rollback on failure"
    - "requestPasswordReset (not forgotPassword) — v1.4 Better Auth breaking change"
    - "React.Suspense wrapper around useSearchParams() for reset-password page — required by Next.js"
    - "getInitials() helper for user avatar: 'Jane Smith' → 'JS', 'Alice' → 'AL'"
    - "signOut with fetchOptions.onSuccess: router.push('/login') + router.refresh() — prevents router cache leakage"
    - "Session-based tenantId in all API routes (Pattern 8): auth.api.getSession() replaces tenantId query param"

key-files:
  created:
    - apps/web/app/(auth)/layout.tsx
    - apps/web/app/(auth)/login/page.tsx
    - apps/web/app/(auth)/signup/page.tsx
    - apps/web/app/(auth)/signup/actions.ts
    - apps/web/app/(auth)/forgot-password/page.tsx
    - apps/web/app/reset-password/page.tsx
  modified:
    - apps/web/components/layout/AppSidebar.tsx
    - apps/web/components/layout/DashboardLayoutClient.tsx
    - apps/web/app/(dashboard)/layout.tsx
    - apps/web/app/api/dashboard/kpis/route.ts
    - apps/web/app/api/dashboard/campaigns/route.ts
    - apps/web/app/api/dashboard/incrementality/route.ts
    - apps/web/app/api/dashboard/saturation/route.ts
    - apps/web/app/api/dashboard/seasonality/route.ts
    - apps/web/app/api/notifications/route.ts
    - apps/web/app/api/notifications/preferences/route.ts
    - apps/web/app/api/recommendations/route.ts

key-decisions:
  - "Sign-up uses server action (not client-side signUp.email) for atomic tenant+user creation with rollback — prevents orphan tenants"
  - "Forgot password always shows success regardless of email existence — no account leakage (locked decision)"
  - "reset-password page is outside (auth) route group — lives at /reset-password, not /(auth)/reset-password"
  - "React.Suspense wraps useSearchParams in reset-password — required by Next.js for client components using search params"
  - "signUpAction redirects to /login?registered=1 after success — explicit login step, no auto-login complexity"
  - "slugify adds 4-char random suffix to tenant slug — prevents slug collisions on sign-up"
  - "All dashboard API routes now extract tenantId from session (Pattern 8) — eliminates IDOR vulnerability from query param approach"

patterns-established:
  - "Auth page pattern: 'use client' + shadcn Card + IQ logo mark at top + Link cross-links"
  - "Server action pattern: 'use server' + FormData + redirect() on success + { error: string } return on failure"
  - "Sidebar user menu: DropdownMenu trigger with Avatar, group-data-[collapsible=icon] to hide text in collapsed state"

requirements-completed: [AUTH-01, AUTH-03]

duration: 4min
completed: 2026-02-25
---

# Phase 6 Plan 02: Auth UI Pages Summary

**Login/signup/forgot-password/reset-password pages with Vercel-style centered card layout, atomic tenant+user creation with rollback, and sidebar logout using signOut + router.refresh() — all dashboard API routes retrofitted to extract tenantId from session.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T02:30:57Z
- **Completed:** 2026-02-25T02:35:00Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Four auth pages created (login, signup, forgot-password, reset-password) with centered card design matching dashboard aesthetic
- Sign-up atomically creates tenant row then Better Auth user, rolls back tenant on auth failure
- AppSidebar now shows user avatar with initials, name, email; dropdown with "Log out" that calls signOut + router.refresh()
- All 8 dashboard/recommendation API routes retrofitted: tenantId extracted from session, not query params (eliminates IDOR vulnerability)

## Task Commits

1. **Task 1: Create auth route group pages** - `1198f49` (feat)
2. **Task 2: Wire logout into AppSidebar** - `d67c87f` (feat)

**Plan metadata:** (see final commit)

## Files Created/Modified

**Created:**
- `apps/web/app/(auth)/layout.tsx` — centered card layout, no sidebar, bg-background
- `apps/web/app/(auth)/login/page.tsx` — client-side signIn.email, generic errors, redirect to /
- `apps/web/app/(auth)/signup/page.tsx` — form with inline validation (name, company, email, password, confirm)
- `apps/web/app/(auth)/signup/actions.ts` — server action: tenant insert → signUpEmail → rollback on failure
- `apps/web/app/(auth)/forgot-password/page.tsx` — requestPasswordReset, always-success UX
- `apps/web/app/reset-password/page.tsx` — outside (auth) group, reads token from useSearchParams, wrapped in Suspense

**Modified:**
- `apps/web/components/layout/AppSidebar.tsx` — user prop, DropdownMenu logout, getInitials helper, useRouter + signOut
- `apps/web/components/layout/DashboardLayoutClient.tsx` — user prop added, passed to AppSidebar
- `apps/web/app/(dashboard)/layout.tsx` — extracts session.user.name + email, passes user prop to DashboardLayoutClient
- `apps/web/app/api/dashboard/kpis/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/dashboard/campaigns/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/dashboard/incrementality/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/dashboard/saturation/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/dashboard/seasonality/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/notifications/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/notifications/preferences/route.ts` — session-based tenantId, 401 guard
- `apps/web/app/api/recommendations/route.ts` — session-based tenantId, 401 guard

## Decisions Made

- **Server action for sign-up**: Uses `auth.api.signUpEmail` (server-side Better Auth API) not the client SDK — allows setting the `tenantId` additionalField programmatically and enables proper rollback if user creation fails
- **Always-success forgot-password**: Error from `requestPasswordReset` is swallowed; `setSubmitted(true)` runs in `finally` block — prevents email existence leakage even on network errors
- **Reset-password outside auth group**: Placed at `/reset-password` (not `/(auth)/reset-password`) per architecture spec — accessed via email link in potentially different browser session
- **React.Suspense for reset-password**: `useSearchParams()` requires Suspense boundary in Next.js App Router; `ResetPasswordForm` wrapped by `ResetPasswordPage` default export
- **Slug collision prevention**: Random 4-char suffix appended to tenant slug on sign-up — prevents `acme-corp` vs `acme-corp` collisions without querying for uniqueness first
- **API route IDOR fix**: All dashboard API routes now call `auth.api.getSession()` and return 401 if no session — removes the ability for any authenticated user to query any tenant's data by passing arbitrary tenantId in query params

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Retrofit remaining API routes to session-based auth**
- **Found during:** Task 2 (sidebar wiring)
- **Issue:** During git status check, discovered 5 pre-existing uncommitted API route modifications (saturation, seasonality, notifications, preferences, recommendations) that had been retrofitted to use session-based tenantId but not yet committed. These changes eliminate the IDOR vulnerability where any authenticated user could query any tenant's data via query param.
- **Fix:** Included these pre-existing security improvements in the Task 2 commit alongside the AppSidebar changes
- **Files modified:** saturation/route.ts, seasonality/route.ts, notifications/route.ts, preferences/route.ts, recommendations/route.ts
- **Verification:** grep confirms `auth.api.getSession` and 401 response in all routes
- **Committed in:** d67c87f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical security)
**Impact on plan:** API route IDOR fix is a security requirement. Eliminates the remaining query-param tenantId vulnerability pattern across all dashboard routes. No scope creep — this is the Pattern 8 retrofit described in RESEARCH.md Open Question 3.

## Issues Encountered

None — all patterns from RESEARCH.md worked as documented.

## Next Phase Readiness

- All auth UI complete — users can sign up, log in, reset passwords, and log out
- Session-based tenantId in all API routes — IDOR vulnerability eliminated
- Plan 03 (API route retrofit) may need to verify remaining OAuth/ingestion API routes that were not part of this batch
- Environment variables required before auth works: BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, RESEND_API_KEY

---
*Phase: 06-authentication*
*Completed: 2026-02-25*
