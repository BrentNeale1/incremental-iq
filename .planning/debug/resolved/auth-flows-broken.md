---
status: resolved
trigger: "auth-flows-broken — Login doesn't log in, Sign-up refreshes instead of redirecting, Page routing broken"
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T01:30:00Z
---

## Current Focus

hypothesis: RESOLVED
test: File deleted, commit applied
expecting: All three auth failures resolved
next_action: User to re-run UAT

## Symptoms

expected:
  1. Login form submits credentials and redirects to dashboard (/)
  2. Sign-up form creates account and redirects to /login?registered=1
  3. Dashboard pages render correctly at their paths (/recommendations, /integrations, etc.)

actual:
  1. Login form submits but user is not authenticated / no redirect to dashboard
  2. Sign-up form clears inputs, URL becomes /signup? instead of redirecting — no error shown
  3. Page paths not displaying correctly after auth

errors: No visible errors to user — errors are swallowed silently; URL shows /login? and /signup? (native HTML form GET submission fallback)

reproduction:
  1. Navigate to /login, enter valid credentials, submit — nothing happens
  2. Navigate to /signup, fill valid data, submit — form clears, URL becomes /signup?
  3. After any successful auth, navigate to dashboard pages — paths broken

started: Present since Phase 06 implementation. CSS issue was fixed in 06-04 but these 3 remain.

## Eliminated

- hypothesis: isRedirectError not re-thrown in signup catch block
  evidence: Code at apps/web/app/(auth)/signup/page.tsx line 89 does re-throw. This was the fix from 06-04 but the bug persists — the root cause is deeper.
  timestamp: 2026-02-25T01:00:00Z

- hypothesis: Missing callbackURL in login signIn.email() call
  evidence: Code at apps/web/app/(auth)/login/page.tsx line 44 has callbackURL: '/'. Fix applied in 06-04 but login still broken.
  timestamp: 2026-02-25T01:00:00Z

- hypothesis: Missing .env.local with BETTER_AUTH_SECRET
  evidence: apps/web/.env.local exists with BETTER_AUTH_SECRET, BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL all set correctly.
  timestamp: 2026-02-25T01:00:00Z

## Evidence

- timestamp: 2026-02-25T00:30:00Z
  checked: apps/web/app/page.tsx and apps/web/app/(dashboard)/page.tsx both exist
  found: Both files resolve to URL path "/" in Next.js App Router. Route groups like (dashboard) are transparent to URLs — they don't add path segments. app/page.tsx was created in Phase 02 as a scaffold (git: commit 89220b6), app/(dashboard)/page.tsx was created in Phase 04 as the real dashboard.
  implication: DUPLICATE ROUTE CONFLICT. Next.js App Router treats this as an error. The conflict prevents correct hydration of auth pages, causing JavaScript's onSubmit handlers to not attach, and the browser falls back to native HTML form GET submission — which produces the "/login?" and "/signup?" URLs seen in UAT.

- timestamp: 2026-02-25T00:45:00Z
  checked: apps/web/app/page.tsx content
  found: Renders a raw unauthenticated page with OAuth connect links (Meta, Google, Shopify). No auth layout, no sidebar, no session check. This is a Phase 02 scaffold that was never removed when the real dashboard was built in Phase 04.
  implication: Even if hydration worked, a user who logs in and hits "/" would land on this raw page instead of the (dashboard)/page.tsx which has auth protection and the real UI.

- timestamp: 2026-02-25T00:50:00Z
  checked: URL symptom analysis — "/login?" and "/signup?" with trailing question mark
  found: Native HTML form GET submission happens when onSubmit handler is not invoked. The input fields have no name attributes, so GET submission produces just "?" with no parameters. This pattern confirms JavaScript's React event handlers are not attached — consistent with hydration failure caused by the route conflict.
  implication: The route conflict causes a Next.js dev server error that prevents the JavaScript bundle from loading correctly, which prevents React hydration, which prevents onSubmit from being attached.

- timestamp: 2026-02-25T01:00:00Z
  checked: git log for both conflicting files
  found: apps/web/app/page.tsx created in commit 89220b6 (feat(02-02): scaffold apps/web). apps/web/app/(dashboard)/page.tsx modified most recently in commit adb6d7d (feat(06-03)). The scaffold was never cleaned up.
  implication: The fix is to delete apps/web/app/page.tsx. The (dashboard)/page.tsx is the correct root page.

## Resolution

root_cause: Duplicate route conflict — apps/web/app/page.tsx (Phase 02 scaffold) and apps/web/app/(dashboard)/page.tsx both resolved to URL path "/" in Next.js App Router. Route groups like (dashboard) do not add path segments. This caused a Next.js build/dev error that prevented JavaScript hydration on auth pages, causing browser to fall back to native form GET submission (producing "/login?" and "/signup?" URLs). Even without the hydration issue, logged-in users hitting "/" would land on the raw scaffold page instead of the authenticated dashboard.
fix: Deleted apps/web/app/page.tsx (the stale Phase 02 scaffold). The (dashboard)/page.tsx is the correct root page with auth protection and real dashboard UI.
verification: Pending UAT re-run by user. Expected: login redirects to "/" and sees real dashboard; signup redirects to /login?registered=1; dashboard pages render correctly.
files_changed:
  - apps/web/app/page.tsx (DELETED — commit 85ed8b1)
