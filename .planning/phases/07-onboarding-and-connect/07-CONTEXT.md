# Phase 7: Onboarding & Integration Connect - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Guided post-signup onboarding wizard that connects 4 orphaned components (integration connectors, GA4EventSelector, MarketConfirmationStep, OutcomeModeSelector) into a step-by-step flow. New users complete setup after first sign-up. Settings page access for post-onboarding changes is in scope; new integration types or analytics features are not.

</domain>

<decisions>
## Implementation Decisions

### Wizard Structure & Progression
- Linear, fixed-order wizard: Connect integrations -> Select GA4 events -> Confirm markets -> Set outcome mode
- Full-page wizard at dedicated `/onboarding` route — no dashboard distractions
- Numbered stepper bar at top showing Step 1/2/3/4 with labels, current step highlighted
- Back and Next buttons — user can navigate to review/change previous steps, state preserved
- No step skipping — must complete in order

### Integration Connect Experience
- Integration categories: **commerce/analytics source** (Shopify, CRM, or GA4) and **paid channel** (Meta or Google Ads)
- GA4 is its own integration — NOT grouped under "Google"
- Must connect at least one commerce/analytics source AND at least one paid channel to proceed
- Cards layout: one card per integration with logo + "Connect" button, status updates in-place
- OAuth flow opens in popup window — user stays on wizard page, popup closes on completion, card updates to "Connected"
- Connection failure: inline error state on the card with "Retry" button, other cards remain available

### Market Confirmation UX
- Editable list with inline actions — each row has rename (inline edit), delete (X button)
- Add button at bottom for manual market entry
- Merge via checkbox multi-select + "Merge" button, prompts for merged market name
- Empty state: message "No markets detected yet. Add your markets manually." with Add button
- Batch save — all edits saved when user clicks Next (single API call), can undo before committing

### Post-Onboarding Behavior
- After completing wizard: fade to a clean transition screen showing data ingestion overview (amount of data to inject, expected calculation wait times), then auto-redirect to dashboard after ~10 seconds
- Onboarding settings accessible via Settings page in dashboard — no wizard replay
- Mid-onboarding abandonment: state persisted, user resumes where they left off on return
- Returning onboarded users who navigate to /onboarding get redirected to dashboard

### Claude's Discretion
- Exact stepper bar visual design and spacing
- Loading/skeleton states during OAuth flow
- Transition screen visual design and data summary formatting
- Error state copy and retry UX details
- Mobile responsiveness approach for cards and market list

</decisions>

<specifics>
## Specific Ideas

- Transition screen after onboarding should fade in from blank — not a harsh redirect. Show overview of how much data will be ingested (e.g., "Importing 12 months of GA4 data, 3 ad campaigns...") and expected wait times for calculations. Auto-redirect to dashboard after ~10 seconds.
- Integration cards should clearly show connected vs. not-connected state with visual distinction
- Market merge flow: checkbox + merge button pattern, not drag-and-drop

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-onboarding-and-connect*
*Context gathered: 2026-02-25*
