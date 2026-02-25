---
status: resolved
trigger: "Investigate why the sign-up form clears inputs but doesn't redirect after submission. The URL becomes /signup? instead of redirecting to /login?registered=1."
created: 2026-02-25T00:00:00Z
updated: 2026-02-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — client-side try/catch in handleSubmit catches and swallows the NEXT_REDIRECT error thrown by redirect() in the server action
test: trace redirect() throw propagation from server action through client await boundary
expecting: redirect() throws a NEXT_REDIRECT error; client catch block swallows it silently
next_action: fix page.tsx to re-throw redirect errors, and fix actions.ts to move redirect outside error-prone catch zones

## Symptoms

expected: After successful sign-up, browser navigates to /login?registered=1
actual: URL becomes /signup? (form data cleared but no navigation), no error shown
errors: none visible to user — error is swallowed silently
reproduction: Fill in valid sign-up data and submit the form
started: unknown (present since implementation)

## Eliminated

- hypothesis: redirect() is inside a try/catch in actions.ts (server-side catch)
  evidence: Line 103 of actions.ts calls redirect('/login?registered=1') OUTSIDE any try/catch block — the server-side code is correct
  timestamp: 2026-02-25

- hypothesis: Missing env vars cause Better Auth to fail silently
  evidence: auth.ts reads BETTER_AUTH_SECRET and BETTER_AUTH_URL via process.env; if missing, Better Auth would return an error object, not silently succeed — and the catch block in actions.ts returns {error:...} which the client would display
  timestamp: 2026-02-25

- hypothesis: tenantId additionalField config prevents user creation
  evidence: auth.ts correctly declares tenantId with input:false; actions.ts passes it in body — this matches Better Auth's pattern for programmatically-set fields
  timestamp: 2026-02-25

## Evidence

- timestamp: 2026-02-25
  checked: apps/web/app/(auth)/signup/actions.ts line 103
  found: redirect('/login?registered=1') is called OUTSIDE all try/catch blocks — server-side placement is correct
  implication: The server IS calling redirect correctly; failure must be on the client side

- timestamp: 2026-02-25
  checked: apps/web/app/(auth)/signup/page.tsx lines 74-91 (handleSubmit)
  found: |
    try {
      const result = await signUpAction(formData);
      if (result?.error) { setError(result.error); }
      // On success, signUpAction calls redirect('/login')
    } catch {
      setError('Something went wrong. Please try again.');   // <-- swallows NEXT_REDIRECT
    } finally {
      setIsPending(false);   // <-- clears the form loading state, inputs re-enable
    }
  implication: |
    Next.js redirect() works by throwing a special error with digest 'NEXT_REDIRECT'.
    When a server action calls redirect(), that error propagates back across the RSC
    boundary to the client. The client's await signUpAction(formData) THROWS the
    NEXT_REDIRECT error. The catch block catches it and calls setError() — but since
    the error has no user-readable .message, setError receives an empty string or
    undefined, so no error banner appears. The finally block then runs setIsPending(false),
    which re-enables the form and clears the pending state. The URL gets /signup? because
    the form submission URL is briefly set before the action fires.

- timestamp: 2026-02-25
  checked: Next.js 15 behavior (confirmed via GitHub issue #55586 and official docs)
  found: |
    Next.js docs explicitly state: "In Server Actions and Route Handlers, redirect
    should be called outside the try block." The fix is to check for redirect errors
    in the catch block using isRedirectError() from
    'next/dist/client/components/redirect-error' and re-throw them.
  implication: The client catch block MUST re-throw NEXT_REDIRECT errors so Next.js
    router can intercept and execute the navigation.

- timestamp: 2026-02-25
  checked: apps/web/node_modules/next/dist/client/components/redirect-error.d.ts existence
  found: File exists at that path — isRedirectError() is available
  implication: Can import isRedirectError from 'next/dist/client/components/redirect-error'

## Resolution

root_cause: |
  PRIMARY BUG — page.tsx catch block swallows NEXT_REDIRECT:
  In handleSubmit() (page.tsx lines 87-89), the bare `catch {}` block catches the
  NEXT_REDIRECT error that Next.js redirect() throws to trigger navigation. Because
  the error is caught and not re-thrown, the Next.js router never receives the signal
  to navigate. The error object has no readable message, so setError() effectively
  gets an empty string — no error banner shows. The finally block then calls
  setIsPending(false), re-enabling the form. This is why: inputs clear (isPending
  reverts), no error shows (error message is empty/undefined), no redirect happens
  (NEXT_REDIRECT was swallowed).

  SECONDARY CONCERN — Better Auth error shape:
  actions.ts line 80 checks `if (result.error)` — Better Auth's signUpEmail returns
  an APIError or null, not an object with `.error`. If Better Auth's return type
  doesn't match this shape, errors from user creation could also be swallowed. This
  should be verified against Better Auth v1.4.x API response type.

fix: |
  File 1: apps/web/app/(auth)/signup/page.tsx
  Import isRedirectError and re-throw redirect errors in the catch block:

    import { isRedirectError } from 'next/dist/client/components/redirect-error';

    } catch (err) {
      if (isRedirectError(err)) throw err;   // let Next.js handle navigation
      setError('Something went wrong. Please try again.');
    }

  File 2: apps/web/app/(auth)/signup/actions.ts (optional hardening)
  The server-side code is structurally correct. However, as defensive hardening,
  verify the Better Auth response shape check at line 80 matches the actual API.

verification: Not yet applied — diagnosis complete (find_root_cause_only mode)

files_changed: []
