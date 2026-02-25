---
phase: 07-onboarding-and-connect
plan: 02
subsystem: onboarding-ui
tags: [onboarding, wizard, oauth, batch-save, routing]
dependency_graph:
  requires:
    - apps/web/app/api/onboarding/status/route.ts
    - apps/web/app/api/onboarding/complete/route.ts
    - apps/web/components/onboarding/GA4EventSelector.tsx
    - apps/web/components/onboarding/MarketConfirmationStep.tsx
    - apps/web/components/onboarding/OutcomeModeSelector.tsx
    - apps/web/lib/auth/tenant-context.tsx
  provides:
    - apps/web/app/(onboarding)/layout.tsx
    - apps/web/app/(onboarding)/onboarding/page.tsx
    - apps/web/components/onboarding/OnboardingWizard.tsx
    - apps/web/components/onboarding/WizardStepper.tsx
    - apps/web/components/onboarding/IntegrationConnectStep.tsx
    - apps/web/components/onboarding/IntegrationCard.tsx
    - apps/web/components/onboarding/BatchMarketConfirmation.tsx
    - apps/web/components/onboarding/OnboardingTransition.tsx
  affects:
    - All new users (routed through /onboarding before reaching dashboard)
    - INTG-04 satisfied (GA4EventSelector reachable and functional)
    - MRKT-02 satisfied (BatchMarketConfirmation batch-save wrapper rendered in Step 3)
tech_stack:
  added: []
  patterns:
    - (onboarding) Next.js route group with isolated layout — no dashboard sidebar/header
    - OAuth popup-close pattern with synchronous window.open() before async work (Pitfall 8)
    - BatchMarketConfirmation forwardRef + useImperativeHandle for save()/canProceed contract
    - Wizard state machine in parent OnboardingWizard, all step components are stateless for step data
    - Resume-on-return: /api/onboarding/status + /api/integrations/status fetched on mount
key_files:
  created:
    - apps/web/app/(onboarding)/layout.tsx
    - apps/web/app/(onboarding)/onboarding/page.tsx
    - apps/web/components/onboarding/OnboardingWizard.tsx
    - apps/web/components/onboarding/WizardStepper.tsx
    - apps/web/components/onboarding/IntegrationConnectStep.tsx
    - apps/web/components/onboarding/IntegrationCard.tsx
    - apps/web/components/onboarding/BatchMarketConfirmation.tsx
    - apps/web/components/onboarding/OnboardingTransition.tsx
  modified: []
decisions:
  - "BatchMarketConfirmation uses forwardRef + useImperativeHandle to expose save()/canProceed — wizard calls save() on Next click, enabling true undo-before-commit (all edits local until flush)"
  - "GA4EventSelectorWithRef wrapper in OnboardingWizard wraps GA4EventSelector to expose handleSave() via ref — wizard controls save timing without modifying the existing GA4EventSelector component"
  - "Post-onboarding settings covered by existing dashboard pages — no additional settings page needed for v1 (IntegrationSettings in Health page, MarketSelector in AppHeader, outcomeMode in tenant preferences)"
  - "Record<string, never> replaced with named empty interface for BatchMarketConfirmation props — TypeScript forwardRef + ref prop incompatibility with index-signature types"
  - "Middleware unchanged — /onboarding is not in isAuthRoute list, so authenticated users pass through; unauthenticated users redirected to /login by existing no-session check"
metrics:
  duration: "6 minutes"
  completed_date: "2026-02-25"
  tasks_completed: 2
  files_modified: 0
  files_created: 8
---

# Phase 07 Plan 02: Onboarding Wizard UI Summary

**One-liner:** Full 4-step onboarding wizard with isolated route group layout, OAuth popup integration cards, GA4 property/event selection, BatchMarketConfirmation batch-save wrapper (no API calls until Next), OutcomeModeSelector, and OnboardingTransition fade screen with auto-redirect.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Onboarding route group, layout, page, wizard orchestrator, stepper, integration connect | 1b27858 | layout.tsx, page.tsx, OnboardingWizard.tsx, WizardStepper.tsx, IntegrationConnectStep.tsx, IntegrationCard.tsx |
| 2 | GA4 sub-flow, BatchMarketConfirmation wrapper, outcome mode, transition screen | cdaef3c | BatchMarketConfirmation.tsx, OnboardingTransition.tsx |

## What Was Built

**Route group and layout:**
- `apps/web/app/(onboarding)/layout.tsx` — server component layout with NO dashboard sidebar. Validates session, redirects to /login if missing. Wraps children in TenantProvider + QueryProvider for clean context chain.
- `apps/web/app/(onboarding)/onboarding/page.tsx` — server component that queries `tenants.onboardingCompleted`. Returning onboarded users are redirected to `/`. Non-onboarded users see `<OnboardingWizard />`.

**WizardStepper:**
- `apps/web/components/onboarding/WizardStepper.tsx` — horizontal 4-step progress bar. Completed steps show green checkmark, current step highlighted with primary color, future steps dimmed. Separator lines between steps.

**IntegrationCard + IntegrationConnectStep:**
- `apps/web/components/onboarding/IntegrationCard.tsx` — individual platform card with 4 visual states (disconnected/connecting/connected/error). Shopify special case: shop domain input field appears before Connect button when `platform === 'shopify'`.
- `apps/web/components/onboarding/IntegrationConnectStep.tsx` — renders cards grouped into "Commerce & Analytics Sources" (Shopify, GA4) and "Paid Channels" (Meta Ads, Google Ads). OAuth popup pattern: `window.open()` called synchronously BEFORE any async work per RESEARCH.md Pitfall 8. Polls `popup.closed` every 500ms to detect abandonment. `canProceed` requires at least one from each category.

**OnboardingWizard:**
- `apps/web/components/onboarding/OnboardingWizard.tsx` — 4-step state machine orchestrator. On mount fetches `/api/onboarding/status` and `/api/integrations/status` to restore wizard position for mid-onboarding return. Manages connectedIntegrations, GA4 property/event state, marketsConfirmed, outcomeMode. Back/Next navigation with per-step canProceed guards. Step 2 skippable when GA4 not connected. Step 3 calls `batchMarketRef.current.save()` before advancing. Step 4 "Complete" button POSTs to `/api/onboarding/complete` then shows OnboardingTransition.

**BatchMarketConfirmation (MRKT-02 compliance):**
- `apps/web/components/onboarding/BatchMarketConfirmation.tsx` — forwardRef component satisfying the CONTEXT.md undo-before-commit contract. All market interactions (confirm, rename, delete, add, merge) update `localMarkets` and push to `pendingActions` array with NO fetch calls. `save()` (exposed via useImperativeHandle) flushes all accumulated actions via a single PUT /api/markets when the wizard calls it on Next click. Merge flow: checkbox multi-select, Merge button appears when 2+ checked, shadcn Dialog prompts for merged market name, rename+merge actions queued. `canProceed` returns true when `localMarkets.length > 0`.

**OnboardingTransition:**
- `apps/web/components/onboarding/OnboardingTransition.tsx` — post-completion fade screen. Fade-in via CSS opacity transition (0→1) on mount using requestAnimationFrame. Shows connected platform list with import detail per platform. "Your first analysis will be ready in 2–4 hours" message. 10-second countdown with auto-redirect to `/` via `useRouter`. Manual "Go to Dashboard" button for impatient users. All timers cleaned up on unmount.

**Settings page (post-onboarding):**
Per CONTEXT.md, no new settings page needed for v1. Existing dashboard surfaces already cover post-onboarding changes: IntegrationSettings in Health page, MarketSelector in AppHeader, outcomeMode in tenant preferences via OutcomeModeSelector.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Record<string, never> incompatible with forwardRef ref prop**
- **Found during:** Task 2 TypeScript verification
- **Issue:** TypeScript error TS2322 — `Record<string, never>` as props type for `BatchMarketConfirmation` made `ref` prop incompatible with `Omit<Record<string, never>, "ref">`. The `never` index signature conflicts with ref injection.
- **Fix:** Replaced `Record<string, never>` with a named empty interface `interface BatchMarketProps {}` — TypeScript forwardRef handles empty interfaces correctly.
- **Files modified:** `apps/web/components/onboarding/BatchMarketConfirmation.tsx`
- **Commit:** cdaef3c

**2. [Rule 2 - Missing functionality] GA4EventSelectorWithRef wrapper in wizard**
- **Found during:** Task 2 wiring review
- **Issue:** GA4EventSelector has its own internal Save button and manages its own event selection state. Wizard needs to call `handleSave()` on Next click without modifying the existing GA4EventSelector component.
- **Fix:** Added `GA4EventSelectorWithRef` forwardRef wrapper inside OnboardingWizard that renders GA4EventSelector and exposes a `handleSave()` ref method. Wizard calls `ga4SelectorRef.current.handleSave()` when advancing from Step 2.
- **Files modified:** `apps/web/components/onboarding/OnboardingWizard.tsx`
- **Commit:** 1b27858

## Verification Results

1. TypeScript compilation: zero errors in any file created by this plan. Pre-existing errors in 9 out-of-scope files unchanged from Plan 01 baseline.
2. `apps/web/app/(onboarding)/layout.tsx` exists — isolated layout with TenantProvider + QueryProvider, no dashboard sidebar.
3. `apps/web/app/(onboarding)/onboarding/page.tsx` exists — server component with onboarding gate and OnboardingWizard render.
4. OnboardingWizard renders 4 steps with Back/Next navigation and per-step canProceed guards.
5. WizardStepper shows 4 numbered steps with correct visual states.
6. IntegrationConnectStep shows cards for Meta, Google, Shopify, GA4.
7. Shopify card has shop domain input field (IntegrationCard platform==='shopify' special case).
8. `window.open()` synchronous OAuth popup pattern confirmed in IntegrationConnectStep.
9. Step 2 shows skip message when GA4 not connected (ga4IntegrationId is null branch).
10. BatchMarketConfirmation uses `useImperativeHandle` — save() flushes via single PUT /api/markets.
11. OutcomeModeSelector rendered in Step 4 with onSelect callback updating wizard state.
12. OnboardingTransition has auto-redirect (REDIRECT_SECONDS=10, setTimeout + useEffect cleanup).
13. All 4 previously orphaned components (GA4EventSelector, MarketConfirmationStep via BatchMarketConfirmation, OutcomeModeSelector, integration cards) are now reachable through the wizard.
14. Middleware verified unchanged — /onboarding correctly passes authenticated users through.

## Self-Check: PASSED
