---
phase: 07-onboarding-and-connect
verified: 2026-02-25T00:00:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
resolution_note: "GA4EventSelector ref gap fixed in commit 9c6b69e — converted to forwardRef + useImperativeHandle exposing handleSave() and hasSelection(). OnboardingWizard uses GA4EventSelector ref directly, removing broken GA4EventSelectorWithRef wrapper."
---

# Phase 07: Onboarding and Connect — Verification Report

**Phase Goal:** New users can connect integrations, select GA4 events, confirm markets, and set outcome mode through a guided onboarding flow — all 4 orphaned components are reachable
**Verified:** 2026-02-25
**Status:** passed — all 4 success criteria verified (gap fixed in commit 9c6b69e)
**Re-verification:** Yes — gap from initial verification fixed and re-verified

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | New user lands on an onboarding wizard after first sign-up with steps to connect integrations (Meta, Google, Shopify), select GA4 events, confirm markets, and set outcome mode | VERIFIED | `apps/web/app/(onboarding)/onboarding/page.tsx` renders `<OnboardingWizard />` for non-onboarded users. Dashboard layout gates non-onboarded users to `/onboarding`. Four-step wizard with IntegrationConnectStep (Step 1), GA4 sub-flow (Step 2), BatchMarketConfirmation (Step 3), OutcomeModeSelector (Step 4). |
| 2 | GA4EventSelector correctly fetches events from GET /api/ga4/events and saves selections via POST with body params | VERIFIED | GET: `data.events` correctly parsed (GA4EventSelector.tsx line 29). POST: GA4EventSelector now exposes `handleSave()` via forwardRef + useImperativeHandle. OnboardingWizard uses the ref directly (no wrapper). When wizard calls `ga4SelectorRef.current.handleSave()` on Next, it triggers the component's own handleSave with its live `selected` state. Fixed in commit 9c6b69e. |
| 3 | MarketConfirmationStep is rendered and functional — user can confirm, rename, merge, add, or delete auto-detected markets | VERIFIED | `BatchMarketConfirmation.tsx` implements all 5 actions (confirm, rename, delete, add, merge) as local-only state mutations with no API calls until `save()` is triggered. Merge dialog implemented (shadcn Dialog). Single PUT /api/markets with accumulated `pendingActions` on `save()`. Wired in OnboardingWizard Step 3 via `batchMarketRef`. |
| 4 | OutcomeModeSelector allows switching between ecommerce and lead_gen outcome modes | VERIFIED | `OutcomeModeSelector.tsx` has no `tenantId` prop, accepts `onSelect` callback, PUTs to `/api/tenant/preferences`. Rendered in OnboardingWizard Step 4 with callback `(mode) => setState(prev => ({ ...prev, outcomeMode: mode }))`. |

**Score:** 4/4 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/db/src/schema/tenants.ts` | onboardingCompleted and onboardingCompletedAt columns | VERIFIED | Lines 25-26: `onboardingCompleted: boolean('onboarding_completed').default(false).notNull()` and `onboardingCompletedAt: timestamp(...)` |
| `packages/db/migrations/0007_onboarding.sql` | ALTER TABLE with onboarding_completed | VERIFIED | Two ALTER TABLE statements: `onboarding_completed boolean NOT NULL DEFAULT false` and `onboarding_completed_at timestamptz` |
| `apps/web/app/api/onboarding/status/route.ts` | GET endpoint with session auth | VERIFIED | 135 lines. Session auth via `auth.api.getSession`. Returns `{ completed, connectedPlatforms, ga4EventsSelected, marketsConfirmed, outcomeMode, suggestedStep }`. Uses `withTenant` for integrations/markets, direct `db.select` for tenants (no-RLS pattern). |
| `apps/web/app/api/onboarding/complete/route.ts` | POST endpoint with session auth | VERIFIED | 48 lines. Session auth. Updates `onboardingCompleted=true` and `onboardingCompletedAt=now()`. Returns `{ success: true }`. |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/(onboarding)/layout.tsx` | Isolated onboarding layout without dashboard sidebar | VERIFIED | 40 lines. Server component. Session validation → redirect /login. Wraps children in TenantProvider + QueryProvider. No sidebar/header. |
| `apps/web/app/(onboarding)/onboarding/page.tsx` | Server component with session check and onboarding gate | VERIFIED | 57 lines. Checks session, queries `tenants.onboardingCompleted`, redirects to `/` if already onboarded, renders `<OnboardingWizard />`. |
| `apps/web/components/onboarding/OnboardingWizard.tsx` | Wizard state machine managing all 4 steps | VERIFIED (with gap) | 462 lines. Fetches `/api/onboarding/status` and `/api/integrations/status` on mount. Back/Next navigation. Per-step canProceed guards. POSTs to `/api/onboarding/complete` on Step 4. GA4EventSelectorWithRef wrapper has wiring bug (see gap). |
| `apps/web/components/onboarding/WizardStepper.tsx` | Numbered step bar (1/2/3/4) with labels | VERIFIED | 86 lines. Four steps: Connect/Events/Markets/Mode. Completed = green + checkmark, current = primary color, future = dimmed. Separator lines between steps. |
| `apps/web/components/onboarding/IntegrationConnectStep.tsx` | Step 1 — integration connect cards with OAuth popup | VERIFIED | 236 lines. Two sections: Commerce & Analytics Sources (Shopify, GA4) and Paid Channels (Meta Ads, Google Ads). `window.open()` called synchronously before async work. Polls `popup.closed` every 500ms. `canProceed` requires at least one from each category. |
| `apps/web/components/onboarding/IntegrationCard.tsx` | Individual platform card with connect/retry/connected states | VERIFIED | 147 lines. Four visual states (disconnected/connecting/connected/error). Shopify domain input field when `platform === 'shopify' && status === 'disconnected'`. Retry button on error. |
| `apps/web/components/onboarding/BatchMarketConfirmation.tsx` | Batch-save wrapper, pendingActions local state, single PUT on save() | VERIFIED | 416 lines. forwardRef + useImperativeHandle. All 5 actions (confirm/rename/delete/add/merge) mutate local state only. `save()` flushes via `PUT /api/markets` with `{ markets: pendingActions }`. Merge dialog with shadcn Dialog. `canProceed` = `localMarkets.length > 0`. |
| `apps/web/components/onboarding/OnboardingTransition.tsx` | Post-completion fade screen with data overview | VERIFIED | 131 lines. Fade-in via CSS opacity transition. Connected platforms list with import details per platform. "2-4 hours" message. 10-second countdown + auto-redirect via `useRouter`. Manual "Go to Dashboard" button. Cleanup on unmount. |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/web/app/(dashboard)/layout.tsx` | `packages/db/src/schema/tenants.ts` | Reads `onboardingCompleted` to gate redirect | WIRED | Lines 42-50: queries `tenants.onboardingCompleted`, `if (!tenantRows[0]?.onboardingCompleted) redirect('/onboarding')` |
| `apps/web/app/api/oauth/meta/callback/route.ts` | `window.opener.postMessage` | HTML response with postMessage for popup close | WIRED | Lines 172-196: `successHtml` with `window.opener.postMessage(data, window.location.origin)` and `window.close()` |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `OnboardingWizard.tsx` | `/api/onboarding/status` | fetch on mount to restore wizard state | WIRED | Lines 78: `fetch('/api/onboarding/status')` in mount useEffect `initialize()` |
| `OnboardingWizard.tsx` | `/api/onboarding/complete` | POST on final step completion | WIRED | Line 233: `fetch('/api/onboarding/complete', { method: 'POST' })` on Step 4 |
| `IntegrationCard.tsx` | `window.open` | OAuth popup in click handler | WIRED | Line 104 of IntegrationConnectStep.tsx: `window.open(oauthUrl, 'oauth', 'width=600,height=700,scrollbars=yes')` called synchronously |
| `OnboardingWizard.tsx` | `IntegrationConnectStep.tsx` | renders Step 1 component | WIRED | Line 281: `<IntegrationConnectStep connectedIntegrations={...} onIntegrationConnected={handleIntegrationConnected} />` |
| `OnboardingWizard.tsx` | `GA4EventSelector.tsx` | renders Step 2 component (if GA4 connected) | PARTIALLY WIRED | `GA4EventSelector` is rendered inside `GA4EventSelectorWithRef` (line 459). Display works. But wizard's save trigger is broken — handleSave() on the ref uses disconnected state. |
| `OnboardingWizard.tsx` | `BatchMarketConfirmation.tsx` | renders Step 3 via batch wrapper; wizard calls save() on Next click | WIRED | Line 358: `<BatchMarketConfirmation ref={batchMarketRef} />`. Line 218: `await batchMarketRef.current.save()` on Next in Step 3. |
| `BatchMarketConfirmation.tsx` | `/api/markets` | single PUT with accumulated pendingActions on save() | WIRED | Lines 88-92: `fetch('/api/markets', { method: 'PUT', body: JSON.stringify({ markets: pendingActions }) })` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTG-04 | 07-01, 07-02 | User can connect GA4 and select which conversion events represent leads | SATISFIED | GA4 connection via OAuth popup: VERIFIED. GA4EventSelector GET fix (data.events): VERIFIED. Wizard-triggered save via Next button: FIXED (commit 9c6b69e). GA4EventSelector now exposes handleSave() via forwardRef + useImperativeHandle, and OnboardingWizard calls it directly without the broken wrapper. |
| MRKT-02 | 07-01, 07-02 | User confirms or corrects detected markets during onboarding | SATISFIED | `BatchMarketConfirmation.tsx` renders all market actions (confirm, rename, merge, add, delete) in the wizard Step 3. All edits held in local state, single PUT /api/markets on wizard's Next click via `batchMarketRef.current.save()`. Undo-before-commit contract from CONTEXT.md is satisfied. |

**INTG-04 note from REQUIREMENTS.md traceability:** Requirement was specifically reset to Pending and reassigned to Phase 7 because it was partially implemented. The GET fix is complete but the wizard-integrated save path (the mechanism new users actually use) is broken.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `OnboardingWizard.tsx` | 426-448 | `GA4EventSelectorWithRef` maintains `selected` state that is never updated; `handleSave()` always returns early because `selected.size === 0` | Blocker | Wizard-triggered GA4 event save never fires. Users must use the inner Save button, but the wizard's Next button skips the save silently. |
| `OnboardingWizard.tsx` | 450-461 | Comment says "we pass our own selected state override to it" but no such override is implemented — `GA4EventSelector` receives only `integrationId` and `propertyId`, managing its state fully internally | Warning | Misleading comment; the override never happened. |

---

## Human Verification Required

### 1. GA4 Event Selections — Inner Save Button vs. Wizard Next

**Test:** Connect a GA4 integration in Step 1. Advance to Step 2. Select GA4 events using the checkbox UI. Click Next (do NOT click the inner "Save N Events" button).
**Expected (per spec):** Events should be saved via POST /api/ga4/events before Step 3 opens.
**Actual (per code):** No POST is made. `GA4EventSelectorWithRef.handleSave()` returns immediately because its internal `selected` Set is always empty.
**Why human:** Needs running app + network tab inspection to confirm no POST fires.

### 2. OAuth Popup Flow — All 4 Platforms

**Test:** Click Connect for each of Meta, Google, Shopify (with domain), and GA4 in Step 1. Complete each OAuth flow in the popup.
**Expected:** Popup closes, card shows "Connected" badge, integration added to wizard state.
**Why human:** Requires real OAuth credentials and a running app; can't simulate postMessage flow programmatically.

### 3. Wizard Resume on Return

**Test:** Start onboarding, connect one integration (completing Step 1), then close the browser. Re-open and navigate to /onboarding.
**Expected:** Wizard resumes at Step 2 (or whichever step the suggestedStep API returns).
**Why human:** Requires actual session + DB state across navigation.

### 4. BatchMarketConfirmation — Undo Before Commit

**Test:** In Step 3, rename a market, delete a market, add a new market. Verify no network requests fire. Then click Next.
**Expected:** Single PUT /api/markets fires with all accumulated pendingActions.
**Why human:** Requires network tab inspection to confirm single-request batch behavior.

---

## Gaps Summary

**One gap blocks full INTG-04 compliance.** The `GA4EventSelectorWithRef` wrapper in `OnboardingWizard.tsx` (lines 422-462) is architecturally disconnected from the `GA4EventSelector` it renders. The wrapper maintains its own `selected: Set<string>` state initialized to `new Set()` that is never updated — there is no `onSelectionChange` callback, no shared ref, and no state lift. When the wizard's Next button triggers `ga4SelectorRef.current.handleSave()`, it hits the guard `if (selected.size === 0) return` and exits without making any API call.

This means: users who go through the onboarding wizard and click Next on Step 2 do **not** have their GA4 event selections persisted. The inner `GA4EventSelector` component renders correctly and its own internal Save button works, but that button is not part of the wizard flow.

**Fix path (simplest):** Convert `GA4EventSelector` to expose its `handleSave` via `useImperativeHandle`, removing the need for the `GA4EventSelectorWithRef` wrapper entirely. Or: lift selected state into `GA4EventSelectorWithRef` and render the event list/checkbox UI directly there, using `GA4EventSelector` only for the fetch logic.

The rest of the phase goal is achieved. All 4 previously-orphaned components are reachable (GA4EventSelector in Step 2, BatchMarketConfirmation wrapping MarketConfirmationStep behavior in Step 3, OutcomeModeSelector in Step 4, and IntegrationCard/IntegrationConnectStep in Step 1). The onboarding gate, dashboard redirect, migration, OAuth popup pattern, and batch market save all verified correctly.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
