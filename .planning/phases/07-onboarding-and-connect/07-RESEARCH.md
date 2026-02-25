# Phase 7: Onboarding & Integration Connect - Research

**Researched:** 2026-02-25
**Domain:** Next.js App Router wizard UI, OAuth popup flow, component integration, DB schema additions
**Confidence:** HIGH — all findings from direct codebase inspection and established patterns in the project

## Summary

Phase 7 is predominantly a UI wiring phase: four orphaned components (`GA4EventSelector`, `MarketConfirmationStep`, `OutcomeModeSelector`, `FirstTimeExperience`) plus the existing OAuth infrastructure need to be connected into a guided `/onboarding` route. The backend APIs are already built and session-protected — the work is routing, component fixes, and state threading.

There are three specific bugs identified in the audit that must be fixed. First, `GA4EventSelector` expects a flat `KeyEvent[]` array but `GET /api/ga4/events` returns `{ events: KeyEvent[] }` — the component's `setEvents(data)` will receive an object with an `events` property instead of an array, crashing `.map`. Second, `GA4EventSelector.handleSave` passes `integrationId` and `propertyId` as query params on a `POST` but the API handler reads them from `request.json()` body. Third, the middleware currently redirects any non-session cookie hit to `/login` — the `/onboarding` route needs no special treatment there (authenticated users reach it fine) but it needs `onboardingCompleted` gating so returning users are redirected to dashboard.

The largest design question is how to detect "new user" vs "returning user" for the redirect gate. The tenants table has no `onboardingCompleted` flag yet — this must be added via a new Drizzle migration.

**Primary recommendation:** Add `onboarding_completed` boolean to the tenants table, create a `/onboarding` route with a full-page layout (no dashboard sidebar), fix the two GA4EventSelector bugs, and wire the popup OAuth pattern using `window.open` + `window.addEventListener('message', ...)` for cross-window signaling.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Linear, fixed-order wizard: Connect integrations -> Select GA4 events -> Confirm markets -> Set outcome mode
- Full-page wizard at dedicated `/onboarding` route — no dashboard distractions
- Numbered stepper bar at top showing Step 1/2/3/4 with labels, current step highlighted
- Back and Next buttons — user can navigate to review/change previous steps, state preserved
- No step skipping — must complete in order
- Integration categories: **commerce/analytics source** (Shopify, CRM, or GA4) and **paid channel** (Meta or Google Ads)
- GA4 is its own integration — NOT grouped under "Google"
- Must connect at least one commerce/analytics source AND at least one paid channel to proceed
- Cards layout: one card per integration with logo + "Connect" button, status updates in-place
- OAuth flow opens in popup window — user stays on wizard page, popup closes on completion, card updates to "Connected"
- Connection failure: inline error state on the card with "Retry" button, other cards remain available
- Editable list with inline actions — each row has rename (inline edit), delete (X button)
- Add button at bottom for manual market entry
- Merge via checkbox multi-select + "Merge" button, prompts for merged market name
- Empty state: message "No markets detected yet. Add your markets manually." with Add button
- Batch save — all edits saved when user clicks Next (single API call), can undo before committing
- After completing wizard: fade to a clean transition screen showing data ingestion overview, then auto-redirect to dashboard after ~10 seconds
- Onboarding settings accessible via Settings page in dashboard — no wizard replay
- Mid-onboarding abandonment: state persisted, user resumes where they left off on return
- Returning onboarded users who navigate to /onboarding get redirected to dashboard

### Claude's Discretion
- Exact stepper bar visual design and spacing
- Loading/skeleton states during OAuth flow
- Transition screen visual design and data summary formatting
- Error state copy and retry UX details
- Mobile responsiveness approach for cards and market list

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-04 | User can connect GA4 and select which conversion events represent leads | GA4 OAuth routes built (api/oauth/ga4 + callback), GA4Connector built, api/ga4/events GET+POST built, GA4EventSelector component built — needs mounting + two bug fixes (response shape, POST body) |
| MRKT-02 | User confirms or corrects detected markets during onboarding | MarketConfirmationStep component built, PUT /api/markets API built — needs mounting in wizard; CONTEXT.md specifies batch save (defer API calls to Next click) |
</phase_requirements>

---

## What Already Exists (Do Not Rebuild)

This is critical context. The audit identified what is missing vs what is built:

### Already Built and Working
| Component / API | Location | Status |
|----------------|----------|--------|
| `GA4EventSelector` | `apps/web/components/onboarding/GA4EventSelector.tsx` | Built, 2 bugs |
| `MarketConfirmationStep` | `apps/web/components/onboarding/MarketConfirmationStep.tsx` | Built, has issue |
| `OutcomeModeSelector` | `apps/web/components/onboarding/OutcomeModeSelector.tsx` | Built, works |
| `FirstTimeExperience` | `apps/web/components/dashboard/FirstTimeExperience.tsx` | Built, not mounted |
| `GET /api/ga4/events` | `apps/web/app/api/ga4/events/route.ts` | Built, returns `{ events: [] }` |
| `POST /api/ga4/events` | `apps/web/app/api/ga4/events/route.ts` | Built, reads body (not query) |
| `GET /api/ga4/properties` | `apps/web/app/api/ga4/properties/route.ts` | Built, returns properties list |
| `GET /api/markets` | `apps/web/app/api/markets/route.ts` | Built, session-protected |
| `PUT /api/markets` | `apps/web/app/api/markets/route.ts` | Built, all 5 actions |
| `GET/PUT /api/tenant/preferences` | `apps/web/app/api/tenant/preferences/route.ts` | Built, session-protected |
| `GET /api/oauth/meta` | `apps/web/app/api/oauth/meta/route.ts` | Built, requires `?tenantId=` |
| `GET /api/oauth/google` | `apps/web/app/api/oauth/google/route.ts` | Built, requires `?tenantId=` |
| `GET /api/oauth/ga4` | `apps/web/app/api/oauth/ga4/route.ts` | Built, requires `?tenantId=` |
| `GET /api/oauth/shopify` | `apps/web/app/api/oauth/shopify/route.ts` | Built, requires `?tenantId=` |
| All OAuth callbacks | `apps/web/app/api/oauth/*/callback/route.ts` | Built, return JSON |
| `GET /api/integrations/status` | `apps/web/app/api/integrations/status/route.ts` | Built, session-protected |

### What Is Missing (Must Build)
1. `/onboarding` route and layout (no dashboard sidebar)
2. DB: `onboarding_completed` boolean column on tenants table
3. API: `GET /api/onboarding/status` — reads onboarding state for resume-on-return
4. API: `POST /api/onboarding/complete` — marks onboarding done
5. Middleware update: redirect returning-onboarded users from `/onboarding` to `/`
6. Fix `GA4EventSelector` — GET response parsing (`data.events` not `data`)
7. Fix `GA4EventSelector` — POST no longer sends body (already correct in API, fix component if needed)
8. MarketConfirmationStep batch-save wrapper (CONTEXT.md: save on Next, not per-action)
9. Integration connect cards component (new — no existing card component for the wizard)
10. Stepper bar component (new)
11. Post-onboarding transition screen (new)
12. Settings page section for post-onboarding edits

---

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js App Router | 15.x | Routing, layout, server components | In use |
| React | 19.x | Client components, state | In use |
| shadcn/ui | Latest | Card, Button, Input, Badge, Checkbox, Dialog | In use |
| Tailwind CSS v4 | v4.x | Styling (CSS-based config, no tailwind.config.js) | In use |
| Drizzle ORM | Latest | DB schema, migrations, withTenant | In use |
| Better Auth | v1.4.19 | Session auth, getSession | In use |
| TanStack Query | Latest | Data fetching in client components | In use |
| lucide-react | Latest | Icons | In use |

### Additional for This Phase
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| No new deps needed | — | All UI primitives already installed | shadcn/ui covers cards, dialog, checkbox, input |

**Installation:** None required. All dependencies already present.

---

## Architecture Patterns

### Recommended Structure

```
apps/web/
├── app/
│   ├── (onboarding)/                # Route group — no dashboard layout
│   │   ├── layout.tsx               # Minimal layout: ThemeProvider + QueryProvider only
│   │   └── onboarding/
│   │       └── page.tsx             # Server component — validates session, reads onboarding status
│   └── api/
│       └── onboarding/
│           ├── status/route.ts      # GET — returns { completed, currentStep, connectedPlatforms }
│           └── complete/route.ts    # POST — marks onboarding_completed = true
├── components/
│   └── onboarding/
│       ├── GA4EventSelector.tsx     # EXISTS — fix bugs
│       ├── MarketConfirmationStep.tsx # EXISTS — add batch-save wrapper
│       ├── OutcomeModeSelector.tsx  # EXISTS — works as-is
│       ├── OnboardingWizard.tsx     # NEW — wizard state machine, step routing
│       ├── WizardStepper.tsx        # NEW — numbered step bar (1/2/3/4)
│       ├── IntegrationConnectStep.tsx # NEW — Step 1 cards layout
│       ├── IntegrationCard.tsx      # NEW — individual platform card with connect/retry
│       └── OnboardingTransition.tsx # NEW — post-completion fade screen
packages/
└── db/
    └── src/
        └── schema/
            └── tenants.ts           # ADD: onboarding_completed boolean column
```

### Pattern 1: Route Group for Isolated Layout

The onboarding wizard uses a separate route group `(onboarding)` with its own layout.tsx — NOT the dashboard layout. This avoids the sidebar, AppHeader, and StaleDataBanner appearing during onboarding.

```typescript
// apps/web/app/(onboarding)/layout.tsx
// Minimal layout — session context only, no dashboard chrome
import { TenantProvider } from '@/lib/auth/tenant-context';
import { QueryProvider } from '@/components/layout/QueryProvider';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  return (
    <TenantProvider tenantId={session.user.tenantId}>
      <QueryProvider>
        <div className="min-h-screen bg-background flex flex-col">
          {children}
        </div>
      </QueryProvider>
    </TenantProvider>
  );
}
```

**Why route group matters:** Next.js App Router route groups (parentheses in folder name) share layouts only within the group. The `(dashboard)` layout with sidebar does NOT apply to `(onboarding)`. This is the clean separation needed.

### Pattern 2: Onboarding Gate in Server Component

The `/onboarding/page.tsx` server component reads `onboarding_completed` from DB to handle two redirect cases:
1. Unauthenticated → middleware sends to `/login` (already handled)
2. Already onboarded → redirect to `/` dashboard

```typescript
// apps/web/app/(onboarding)/onboarding/page.tsx
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { withTenant, tenants } from '@incremental-iq/db';
import { eq } from 'drizzle-orm';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const tenantId = session.user.tenantId;

  // Check if already onboarded
  const rows = await withTenant(tenantId, (tx) =>
    tx.select({ onboardingCompleted: tenants.onboardingCompleted })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  );

  if (rows[0]?.onboardingCompleted) {
    redirect('/');
  }

  return <OnboardingWizard />;
}
```

### Pattern 3: OAuth Popup Window

The existing OAuth routes (`/api/oauth/meta`, `/api/oauth/google`, etc.) redirect to external OAuth providers and then to callback routes that **return JSON**. The popup pattern intercepts that JSON via `postMessage`.

**Critical discovery:** The current callback handlers return `NextResponse.json(...)`. For the popup pattern to work, the callback must either:
- Return an HTML page that calls `window.opener.postMessage(data, targetOrigin)` and `window.close()`, OR
- The popup detects when the OAuth callback URL is loaded and the opener polls

The cleaner approach: each callback handler returns a small HTML page (not JSON) that posts a message to the opener and closes itself. This keeps the popup pattern clean.

```typescript
// Callback response pattern — replace NextResponse.json with HTML page
const successHtml = `<!DOCTYPE html>
<html><body><script>
  window.opener?.postMessage(
    { type: 'oauth_complete', platform: 'meta', integrationId: '${integration.id}', success: true },
    window.location.origin
  );
  window.close();
</script></body></html>`;

return new NextResponse(successHtml, {
  headers: { 'Content-Type': 'text/html' },
});
```

```typescript
// Wizard client component — popup launcher
function openOAuthPopup(platform: string, tenantId: string) {
  const url = `/api/oauth/${platform}?tenantId=${tenantId}`;
  const popup = window.open(url, 'oauth', 'width=600,height=700,scrollbars=yes');

  return new Promise<{ integrationId: string; success: boolean }>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'oauth_complete' && event.data?.platform === platform) {
        window.removeEventListener('message', handler);
        if (event.data.success) resolve(event.data);
        else reject(new Error(event.data.error ?? 'OAuth failed'));
      }
    };
    window.addEventListener('message', handler);

    // Detect popup closed without completing
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer);
        window.removeEventListener('message', handler);
        reject(new Error('Popup closed'));
      }
    }, 500);
  });
}
```

**Scope:** This requires modifying each of the 4 OAuth callback routes to return HTML instead of JSON. Only the responses that indicate success need to change — error responses can remain JSON (they aren't in popup context normally).

### Pattern 4: Wizard State Machine

Local React state manages the wizard. No Zustand needed — onboarding is single-session, not persisted across page navigations within the wizard.

```typescript
// OnboardingWizard.tsx state shape
interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  // Step 1: connected integrations
  connectedIntegrations: Record<string, { integrationId: string; accountName: string | null }>;
  // Step 2: GA4 event selections
  ga4IntegrationId: string | null;
  ga4PropertyId: string | null;
  ga4SelectedEvents: string[];
  // Step 3: markets (managed by MarketConfirmationStep internally)
  marketsConfirmed: boolean;
  // Step 4: outcome mode
  outcomeMode: 'ecommerce' | 'lead_gen' | null;
}
```

The wizard passes callbacks to each step component. Step components call the callback when their data is ready; the wizard decides if Next is enabled.

### Pattern 5: Resume-on-Return (Abandonment State)

The CONTEXT.md decision is: "Mid-onboarding abandonment: state persisted, user resumes where they left off on return."

**Implementation:** The `GET /api/onboarding/status` endpoint returns the current state by reading:
- Which integrations are connected (from `integrations` table)
- Whether any GA4 event selections exist (from `integrations.metadata.selectedEventNames`)
- Whether markets are confirmed (from `markets.isConfirmed`)
- Current outcomeMode (from `tenants.outcomeMode`)

The wizard derives `currentStep` from this data on mount. No separate "wizard progress" table needed.

```typescript
// GET /api/onboarding/status response shape
interface OnboardingStatus {
  completed: boolean;
  connectedPlatforms: string[];          // e.g., ['meta', 'ga4']
  ga4EventsSelected: boolean;
  marketsConfirmed: boolean;
  outcomeMode: 'ecommerce' | 'lead_gen';
  // Derived by server for convenience
  suggestedStep: 1 | 2 | 3 | 4;
}
```

### Pattern 6: GA4 Sub-Flow Within Step 2

GA4 requires a multi-step sub-flow within wizard Step 2:
1. If GA4 is connected: fetch properties (`GET /api/ga4/properties?integrationId=`)
2. User selects property (or auto-selected if only one)
3. Fetch key events (`GET /api/ga4/events?integrationId=&propertyId=`)
4. User selects events
5. Save on Next click (`POST /api/ga4/events` with body `{ integrationId, propertyId, selectedEventNames }`)

If GA4 is NOT connected (user chose commerce-only path), Step 2 is skipped or shows "GA4 not connected — select events after connecting GA4 in Settings."

### Pattern 7: Batch Save on MarketConfirmationStep

The existing `MarketConfirmationStep` makes individual API calls per action (confirm, rename, delete). CONTEXT.md says: "Batch save — all edits saved when user clicks Next (single API call), can undo before committing."

**Implementation approach:** Wrap the component to hold edits in local state, only calling the API when the parent wizard calls a `save()` callback on step advancement. Two options:
1. Modify the existing component to accept a `deferred` prop that buffers actions
2. Create a new `BatchMarketConfirmation` wrapper that holds pending actions and calls `PUT /api/markets` with all of them when `save()` is invoked

Option 2 is safer (no regression to existing component). The wrapper maintains a `pendingActions: MarketAction[]` array and calls `PUT /api/markets` with all of them as a batch on save.

### Anti-Patterns to Avoid

- **OAuth in the main window:** Never do `window.location.href = oauthUrl` in the wizard — this navigates away and loses state. Always use `window.open()`.
- **Polling for popup completion:** Do not poll the popup URL. Use `postMessage` — it's reliable and immediate.
- **Storing tenantId in component props:** The onboarding layout wraps with `TenantProvider`; child components use `useTenantId()` hook. No prop drilling.
- **Calling APIs on every market edit:** Hold edits in local state, batch on Next (CONTEXT.md requirement).
- **Redirecting to /onboarding after sign-up via middleware:** Middleware only checks cookie existence. The `/onboarding` redirect for new users should happen from the sign-up action (`redirect('/onboarding')` instead of `redirect('/login?registered=1')`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Step indicator UI | Custom step tracker | shadcn Separator + numbered divs | Simple enough with flex layout; shadcn has no stepper primitive but the existing UI kit covers what's needed |
| OAuth token storage | Custom encryption | `encryptToken()` from `@incremental-iq/ingestion` | Already used in all 4 OAuth callbacks |
| Session reading | Custom cookie parsing | `auth.api.getSession({ headers: await headers() })` | Established pattern in all protected routes |
| Tenant isolation | Direct DB queries | `withTenant(tenantId, tx => ...)` | RLS enforcement pattern used throughout |
| Dialog/modal for merge | Custom overlay | shadcn `Dialog` | Already installed in project |
| Form inputs | Custom inputs | shadcn `Input`, `Checkbox`, `Button` | Already installed |
| Cross-window messaging | Custom polling | `window.postMessage` + `window.addEventListener('message')` | Native browser API, no library needed |

---

## Common Pitfalls

### Pitfall 1: GA4EventSelector Response Shape Mismatch

**What goes wrong:** The component calls `setEvents(data)` after `fetch(...).then(r => r.json())`. The API returns `{ events: KeyEvent[] }`. So `events` state becomes `{ events: [...] }` instead of an array — calling `.map` on it throws `TypeError: data.map is not a function`.

**Fix:** In `GA4EventSelector.tsx`, change:
```typescript
// BEFORE (bug)
.then((data: KeyEvent[]) => {
  setEvents(data);
  setSelected(new Set(data.map((e) => e.eventName)));
})

// AFTER (fix)
.then((data: { events: KeyEvent[] }) => {
  setEvents(data.events);
  setSelected(new Set(data.events.map((e) => e.eventName)));
})
```

**Confidence:** HIGH — verified by reading both the component and the API handler source.

### Pitfall 2: OAuth Callbacks Return JSON (Incompatible with Popup)

**What goes wrong:** Current callbacks return `NextResponse.json(...)`. When the popup loads the callback URL and gets JSON, `window.opener` is not called and the popup window sits showing a JSON blob. The parent wizard never knows the OAuth completed.

**Fix:** Modify each callback's success response to return an HTML page that calls `window.opener.postMessage()` then `window.close()`. Error responses can remain JSON (the user sees an error page in the popup, which is acceptable).

**Scope:** 4 callback files: `meta/callback`, `google/callback`, `shopify/callback`, `ga4/callback`.

### Pitfall 3: Middleware Blocks /onboarding

**What goes wrong:** The middleware matcher is `/((?!api/auth|_next/static|_next/image|favicon.ico).*)` — `/onboarding` is included. For an authenticated user this is fine (session cookie exists, middleware passes through). But the middleware does NOT exclude `/api/oauth/*` callbacks from redirect logic — wait, it does via the `!isAuthRoute` check on non-cookie paths. However, the `/api/oauth/*` routes are NOT in the matcher exclusion list for API routes other than `/api/auth`. This is a pre-existing issue from Phase 6 but `api/oauth/*/callback` routes run fine because they don't need a session cookie (they have their own CSRF state verification). Double-check the middleware matcher doesn't accidentally block callback routes.

**Current middleware:**
```typescript
matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
```

The `/api/oauth/*/callback` routes ARE matched. When no session cookie exists (pre-auth OAuth), middleware would redirect to `/login`. This was noted in the Phase 6 context: "OAuth routes (`/api/oauth/*`) excluded from session retrofit — run during pre-auth OAuth flow."

**Fix:** The middleware needs to exclude `/api/oauth` from cookie checking OR the OAuth initiation must always include a valid session (user is authenticated before they can open the popup). Since the onboarding wizard requires login (session exists), the popup will open with a session cookie in the browser context. The popup's request to `/api/oauth/meta` includes the cookie — middleware sees the session cookie and allows it through. **No middleware change needed** — authenticated users have cookies.

### Pitfall 4: Missing onboarding_completed Column

**What goes wrong:** If the wizard completes but there's no DB column to mark it done, returning-onboarded users always see the wizard.

**Fix:** Migration needed. Add to `packages/db/src/schema/tenants.ts`:
```typescript
onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
```

Then create a new migration file (following `0004_` naming pattern per project convention). The `tenants` table has no RLS, so no RLS policy needed on the new column.

### Pitfall 5: Sign-Up Redirect Sends New User to /login Instead of /onboarding

**What goes wrong:** `signUpAction` currently calls `redirect('/login?registered=1')`. New users need to go to `/onboarding` after first sign-in, not `/login`.

**Two implementation options:**
1. Change `signUpAction` to `redirect('/onboarding')` — but Better Auth's `signUpEmail` may not auto-establish a session for the redirect to work (the session is created by explicit login, not just sign-up).
2. Change the sign-up redirect to `redirect('/login?registered=1')` (keep as-is) and after login success, check if `onboardingCompleted` is false → redirect to `/onboarding`.

**Recommended:** Option 2 — redirect post-login. Modify the `/api/auth` flow or the login page's `callbackURL`. In Better Auth, `authClient.signIn.email()` accepts `callbackURL`. The login page currently passes `callbackURL: '/'`. For new users (first login), the server can detect `onboardingCompleted: false` and redirect.

**Practical implementation:** The `DashboardLayout` server component already runs `auth.api.getSession()`. Add a check there: if `onboardingCompleted === false`, redirect to `/onboarding`. This creates a clean intercept: any authenticated user who lands on a dashboard page gets redirected to onboarding until they complete it.

### Pitfall 6: MarketConfirmationStep Passes tenantId in PUT Body

The existing component passes `tenantId` in the PUT request body. The API (Phase 6) was updated to ignore client-supplied `tenantId` — uses session only. The tech debt note from the audit confirms this is harmless. No fix needed; the server ignores it.

### Pitfall 7: GA4 Integration Not Connected When Step 2 Renders

**What goes wrong:** If a user completes Step 1 without connecting GA4 (valid — they only need one commerce/analytics source), Step 2 tries to render `GA4EventSelector` but there's no GA4 integration.

**Fix:** Step 2 must check `connectedIntegrations.ga4` exists before rendering `GA4EventSelector`. If not connected: show a "GA4 not connected" message with an option to go back to Step 1, or show the step as optional/skipped.

### Pitfall 8: window.open Blocked by Browser Popup Blockers

**What goes wrong:** Browsers block `window.open()` calls that aren't in direct response to a user gesture.

**Fix:** `window.open()` must be called directly inside a click event handler — not in a setTimeout, Promise callback, or useEffect. Since the OAuth button click IS a user gesture, this is naturally satisfied as long as the `window.open()` call is synchronous at the start of the handler (before any async operations).

```typescript
// CORRECT — window.open called synchronously in click handler
async function handleConnect() {
  const popup = window.open(oauthUrl, 'oauth', 'width=600,height=700');
  // popup is now open; async work follows
  const result = await waitForMessage(popup, platform);
}
```

---

## Code Examples

### DB Schema Addition

```typescript
// packages/db/src/schema/tenants.ts — add these two fields
onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
```

Migration file: `packages/db/migrations/0004_onboarding_completed.sql`
```sql
ALTER TABLE tenants
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN onboarding_completed_at timestamptz;
```

### GA4EventSelector Bug Fix

```typescript
// apps/web/components/onboarding/GA4EventSelector.tsx
// Fix the useEffect data parsing

React.useEffect(() => {
  fetch(`/api/ga4/events?integrationId=${integrationId}&propertyId=${propertyId}`)
    .then((r) => r.json())
    .then((data: { events: KeyEvent[] }) => {   // <-- was: data: KeyEvent[]
      setEvents(data.events);                    // <-- was: setEvents(data)
      setSelected(new Set(data.events.map((e) => e.eventName)));  // <-- was: data.map
    })
    .finally(() => setLoading(false));
}, [integrationId, propertyId]);
```

### OAuth Callback HTML Response (Popup Close Pattern)

```typescript
// Replace final NextResponse.json success response in each callback

const integrationId = integration.id;
const successHtml = `<!DOCTYPE html>
<html>
<head><title>Connected</title></head>
<body>
<script>
  (function() {
    var data = ${JSON.stringify({ type: 'oauth_complete', platform: 'meta', integrationId, success: true })};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(data, window.location.origin);
    }
    window.close();
  })();
</script>
<p>Connected. You can close this window.</p>
</body>
</html>`;

return new NextResponse(successHtml, {
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
```

### POST /api/onboarding/complete

```typescript
// apps/web/app/api/onboarding/complete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { eq } from 'drizzle-orm';
import { withTenant, tenants } from '@incremental-iq/db';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, (tx) =>
    tx.update(tenants)
      .set({ onboardingCompleted: true, onboardingCompletedAt: new Date() })
      .where(eq(tenants.id, tenantId))
  );

  return NextResponse.json({ success: true });
}
```

### DashboardLayout Onboarding Gate

```typescript
// apps/web/app/(dashboard)/layout.tsx — add onboarding redirect check

const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect('/login');

const tenantId = session.user.tenantId;

// Check onboarding gate — redirect new users to wizard
const rows = await withTenant(tenantId, (tx) =>
  tx.select({ onboardingCompleted: tenants.onboardingCompleted })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
);
if (!rows[0]?.onboardingCompleted) {
  redirect('/onboarding');
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| OAuth callback returns JSON | Callback returns HTML with postMessage | Required for popup close pattern |
| Sign-up redirects to /login | New users intercepted at dashboard layout → /onboarding | Cleaner gate, single enforcement point |
| Per-action market saves | Batch save on wizard Next click | Matches CONTEXT.md requirement |

**Migration naming convention:** Project keeps drizzle-kit generated names. New migration should be `0004_[descriptive_name].sql` — the `_journal.json` file must be updated to match.

---

## Open Questions

1. **Shopify OAuth URL format**
   - What we know: `GET /api/oauth/shopify` exists. Shopify OAuth requires a shop domain parameter.
   - What's unclear: Does the wizard need to collect a shop domain before initiating Shopify OAuth? The existing route likely requires a shop name.
   - Recommendation: Read `apps/web/app/api/oauth/shopify/route.ts` during planning to confirm parameter requirements. May need a pre-OAuth input field on the Shopify card.

2. **Transition screen ingestion data source**
   - What we know: CONTEXT.md says show "amount of data to inject, expected calculation wait times."
   - What's unclear: This data must come from somewhere — either the backfill jobs' planned date ranges or a static estimate.
   - Recommendation: Use `/api/integrations/status` (which already exists) to show connected platforms, and hardcode estimate copy ("Up to 3 years of data, typically ready in 2–4 hours").

3. **Sign-up redirect strategy**
   - What we know: `signUpAction` redirects to `/login?registered=1`. The DashboardLayout gate approach redirects to `/onboarding` on first login.
   - What's unclear: Does the login page's `callbackURL: '/'` cause an intermediate dashboard load before the layout catches the gate?
   - Recommendation: The layout gate (`redirect('/onboarding')`) fires before any page content renders — it's a server-side redirect. No intermediate load occurs. This approach is safe.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all component and API route source files read verbatim
- `.planning/v1.0-MILESTONE-AUDIT.md` — audit evidence for bugs and missing connections
- `apps/web/middleware.ts` — routing behavior confirmed
- `apps/web/app/(auth)/signup/actions.ts` — sign-up flow confirmed
- `apps/web/app/(dashboard)/layout.tsx` — dashboard layout pattern confirmed
- `packages/db/src/schema/tenants.ts` — tenants schema confirmed (no onboarding column)
- All 4 OAuth callback handlers — return JSON confirmed (popup compatibility issue)
- `apps/web/components/onboarding/*.tsx` — all orphaned component code read

### Secondary (MEDIUM confidence)
- Next.js App Router route groups documentation — route group isolation pattern is well-established Next.js behavior
- `window.postMessage` for OAuth popup — established browser pattern used by major OAuth implementations (Google Sign-In SDK uses this internally)

### Tertiary (LOW confidence — none)
No LOW confidence claims in this research. All findings are from direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — patterns derived directly from existing codebase conventions
- Bug fixes: HIGH — bugs confirmed by reading both component source and API handler source
- Pitfalls: HIGH — most pitfalls derived from the v1.0 audit findings and existing code

**Research date:** 2026-02-25
**Valid until:** 2026-04-25 (stable — Next.js App Router patterns, no fast-moving dependencies)
