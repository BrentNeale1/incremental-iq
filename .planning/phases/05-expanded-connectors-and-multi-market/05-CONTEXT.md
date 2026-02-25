# Phase 5: Expanded Connectors and Multi-Market - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Users running lead-gen businesses can connect GA4 as a fallback outcome source, and all users get market-segmented attribution that prevents cross-market false signals. Requirements: INTG-04, MRKT-01, MRKT-02, MRKT-03, MRKT-04.

</domain>

<decisions>
## Implementation Decisions

### GA4 Event Selection Flow
- Browse & check UI: show all GA4 conversion events in a checklist, user ticks which ones count as leads
- Multiple events can be selected — all selected events are summed as total leads
- Selection happens during onboarding (right after OAuth) AND is editable later in integration settings
- When user changes event selections after setup, recompute analysis from scratch AND keep the old analysis available as a comparison so they can see the impact of the change
- GA4 is positioned as a fallback/backup — hidden behind a "Don't have a CRM to connect?" link in the connection flow
- GA4 has known accuracy issues; it's not the primary lead-gen path (CRM integrations are the real vision, but those are v2)

### Market Detection & Confirmation
- Auto-detect markets from campaign geo targeting metadata and present as an editable list with confidence indicators (e.g., "AU — 87 campaigns", "US — 243 campaigns")
- User can confirm, rename, merge, or add missing markets on this list
- Market granularity is country-level (AU, US, UK) — no sub-country or custom region groupings
- Campaigns with no geo targeting or targeting "worldwide" go into a "Global/Unassigned" bucket — user can reassign later
- Market detection and confirmation happens during onboarding, right after ad accounts are connected, so analysis runs market-aware from day one

### Market-Segmented Reporting
- Global filter dropdown in the header/toolbar that applies across all report views
- Default view is "All Markets" which shows side-by-side market breakdown (each market as a row/column for comparison)
- Selecting a specific market filters all reports to that market's data
- Market filter persists across page navigation — once user selects "Australia", all reports show AU data until changed
- For single-market users (only one market detected), hide market UI entirely — no selector, no market columns. Keep the interface clean.

### Lead-gen vs Ecommerce Outcome Mode
- User explicitly chooses mode during setup: "Are you tracking revenue or leads?"
- One primary outcome source at a time — either Shopify revenue or GA4 leads, not both simultaneously
- In lead-gen mode, analysis mirrors ecommerce reports with lead terminology: "incremental leads" instead of "incremental revenue", lead counts instead of dollar values
- Lead-gen metrics: lead count as primary, plus closed deals when CRM is connected (v2). For closed deals, analysis should be based on when the lead FIRST inquired, not when the deal closed.

### Claude's Discretion
- Exact GA4 OAuth flow implementation details
- Loading states and error handling during market detection
- How the "Don't have a CRM?" link is styled/positioned in the connector UI
- Exact market list component design (just needs to be editable with confidence indicators)
- How to handle the recompute + comparison UX for changed event selections

</decisions>

<specifics>
## Specific Ideas

- GA4 should be a hidden fallback: only discoverable via "Don't have a CRM to connect?" link. The real lead-gen path will be CRM integrations in v2.
- For closed deals from CRM (v2), attribute based on the lead's FIRST inquiry date, not the close date — this matters for time-series analysis accuracy.
- Market confidence indicators should show campaign counts so users understand why a market was detected.
- "All Markets" default view should show side-by-side comparison, not just aggregated totals — users want to see market differences at a glance.

</specifics>

<deferred>
## Deferred Ideas

- CRM integrations as primary lead-gen source (HubSpot, Salesforce, GoHighLevel, Zoho) — v2 requirements (INTG-09 through INTG-12)
- Closed deal analysis using CRM data with first-inquiry attribution — requires CRM integration (v2)
- Custom region grouping (e.g., "APAC" = AU + NZ + SG) — consider for future enhancement if users request it

</deferred>

---

*Phase: 05-expanded-connectors-and-multi-market*
*Context gathered: 2026-02-25*
