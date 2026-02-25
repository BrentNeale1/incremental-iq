# Phase 8: Market-Aware Recommendations - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add marketId filtering to the recommendations API and engine so that when a user selects a market via MarketSelector, recommendations only include campaigns from that market. This closes the MRKT-04 gap identified during audit.

</domain>

<decisions>
## Implementation Decisions

### Filtering behavior
- Default view (no market selected) shows recommendations from all markets combined
- Instant refresh when MarketSelector changes — no apply button
- Client-side filtering first: filter the already-loaded recommendation set in the browser
- Server-side filtering via API marketId parameter for when fresh data is needed from the engine
- Switching back to "All Markets" restores the cached full set instantly (no re-fetch)

### API contract
- Add optional marketId query parameter to /api/recommendations (satisfies MRKT-04)
- When marketId is provided, the recommendation engine filters at generation time — only campaigns from that market feed into the statistical engine
- Response shape includes full market summary metadata when filtered: marketName, campaignCount, dateRange, totalSpend
- When no marketId is provided, response shape remains unchanged (backwards compatible)

### Dashboard integration
- Subtle text label above recommendations showing filter state (e.g., "Filtered: US Market (12 campaigns)")
- Loading behavior: instant swap for client-side cached data, skeleton loaders only when fetching fresh recommendations from the API
- Market selection persists in session state across page navigations (resets on logout)
- Each recommendation card displays a small market badge/tag showing which market it belongs to — useful in "All Markets" view

### Edge cases
- Empty market (no campaigns): show cross-market suggestions with a note like "No recommendations for this market — here are top picks from other markets"
- Single-market users: hide MarketSelector entirely, show recommendations for that market automatically
- Deleted/empty selected market: gracefully fall back to "All Markets" view with a brief toast notification
- Low-data markets: show a subtle warning like "Limited data — recommendations may improve as more campaigns are added" when a market has very few campaigns

### Claude's Discretion
- Exact threshold for "low data" warning (number of campaigns)
- Skeleton loader design and animation
- Toast notification duration and styling
- Market badge color/design on recommendation cards

</decisions>

<specifics>
## Specific Ideas

- Client-side filtering should be the primary UX path for speed — server-side is for fresh generation when API is called with marketId
- Cross-market suggestions on empty markets keep the recommendations section useful instead of showing a dead-end
- Market badges on cards give users ambient awareness of campaign distribution across markets

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-market-aware-recommendations*
*Context gathered: 2026-02-26*
