# Phase 2: Core Data Ingestion - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Connect Meta Ads, Google Ads, and Shopify via OAuth. Pull campaign spend data (Meta, Google Ads) and order/revenue data (Shopify) through a validated ingestion pipeline. Backfill up to 3 years of historical data. Show data freshness per integration. GA4 and additional connectors are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Sync & scheduling
- Daily overnight sync for all platforms
- Each platform syncs independently — one failure does not block others
- On partial sync failure (e.g., rate-limited after 60%), keep successfully pulled data and retry the rest on the next cycle
- Manual "Sync now" button available per integration, but rate-limited to prevent API abuse (limit the number of manual refreshes a user can trigger)

### Historical backfill
- Auto-max backfill on first connection — pull as much history as the API allows (up to 3 years), no user prompt needed
- Allow manual override of backfill range in settings
- Show live progress during backfill per platform (e.g., "Meta Ads: 14 of 36 months pulled")
- If a source has less than 1 year of data: allow analysis but show a prominent warning that results are less reliable with limited history
- Flag gaps in historical data visually on a timeline view so user understands where data is missing

### Data freshness UX
- Per-integration freshness badge on the integrations/settings page ("Last synced: 2h ago")
- Global summary indicator visible from the main dashboard showing freshness across all integrations
- When a sync is broken (token expired, permissions revoked): in-app warning banner AND email notification to the user
- During active sync: show last completed sync time alongside "New Sync in Progress..." label to avoid confusion
- Short sync history log per integration (last 5-7 syncs with success/partial/failed status) to help diagnose recurring issues

### Claude's Discretion
- OAuth flow UI details and connection sequence
- Exact rate limit numbers for manual refresh (how many per day)
- Specific retry logic and backoff strategy for API rate limits
- Data transformation and normalization pipeline architecture
- How to map platform-specific data structures into the unified schema

</decisions>

<specifics>
## Specific Ideas

- Manual refresh should be clearly rate-limited — the user should understand they can't spam it, but the exact limit is a technical decision
- Backfill progress should feel like watching a real download — concrete numbers, not just a spinner
- "New Sync in Progress..." label specifically chosen to reduce confusion about whether displayed data is stale or updating

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-core-data-ingestion*
*Context gathered: 2026-02-24*
