# Phase 5: Expanded Connectors and Multi-Market - Research

**Researched:** 2026-02-25
**Domain:** GA4 OAuth/Data API integration, Google Ads geo targeting, multi-market DB schema, market-segmented analysis, React/Zustand market filter state
**Confidence:** MEDIUM-HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**GA4 Event Selection Flow**
- Browse & check UI: show all GA4 conversion events in a checklist, user ticks which ones count as leads
- Multiple events can be selected — all selected events are summed as total leads
- Selection happens during onboarding (right after OAuth) AND is editable later in integration settings
- When user changes event selections after setup, recompute analysis from scratch AND keep the old analysis available as a comparison so they can see the impact of the change
- GA4 is positioned as a fallback/backup — hidden behind a "Don't have a CRM to connect?" link in the connection flow
- GA4 has known accuracy issues; it's not the primary lead-gen path (CRM integrations are the real vision, but those are v2)

**Market Detection & Confirmation**
- Auto-detect markets from campaign geo targeting metadata and present as an editable list with confidence indicators (e.g., "AU — 87 campaigns", "US — 243 campaigns")
- User can confirm, rename, merge, or add missing markets on this list
- Market granularity is country-level (AU, US, UK) — no sub-country or custom region groupings
- Campaigns with no geo targeting or targeting "worldwide" go into a "Global/Unassigned" bucket — user can reassign later
- Market detection and confirmation happens during onboarding, right after ad accounts are connected, so analysis runs market-aware from day one

**Market-Segmented Reporting**
- Global filter dropdown in the header/toolbar that applies across all report views
- Default view is "All Markets" which shows side-by-side market breakdown (each market as a row/column for comparison)
- Selecting a specific market filters all reports to that market's data
- Market filter persists across page navigation — once user selects "Australia", all reports show AU data until changed
- For single-market users (only one market detected), hide market UI entirely — no selector, no market columns. Keep the interface clean.

**Lead-gen vs Ecommerce Outcome Mode**
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

### Deferred Ideas (OUT OF SCOPE)
- CRM integrations as primary lead-gen source (HubSpot, Salesforce, GoHighLevel, Zoho) — v2 requirements (INTG-09 through INTG-12)
- Closed deal analysis using CRM data with first-inquiry attribution — requires CRM integration (v2)
- Custom region grouping (e.g., "APAC" = AU + NZ + SG) — consider for future enhancement if users request it
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-04 | User can connect GA4 and select which conversion events represent leads | GA4 Admin API v1beta listKeyEvents (Node.js: `@google-analytics/admin` v9.0.1); GA4 Data API runReport for daily eventCount by eventName; separate OAuth integration row with platform='ga4' |
| MRKT-01 | System auto-detects markets from campaign geo targeting metadata | Google Ads GAQL `campaign_criterion` + `geo_target_constant.country_code` two-query approach; Meta Ads `targeting.geo_locations.countries` field; parse at sync time, store in `campaign_markets` table |
| MRKT-02 | User confirms or corrects detected markets during onboarding | New DB table `markets` (id, tenantId, countryCode, displayName, campaignCount); onboarding step: MarketConfirmationStep component with editable list + confidence indicators |
| MRKT-03 | Attribution model isolates markets to prevent cross-market false signals | Populate pre-existing `marketId` column on `incrementality_scores`; scoring worker filters metrics by market before calling Python sidecar; market-scoped campaign_metrics queries |
| MRKT-04 | All reports and analysis can be segmented by market | Zustand `useDashboardStore` extended with `selectedMarket: string \| null`; `marketId` query param added to all API routes; DB queries extended with optional market JOIN |
</phase_requirements>

---

## Summary

Phase 5 has three distinct technical domains that must be built in parallel and connected at the end: (1) the GA4 connector, (2) the market detection/confirmation system, and (3) the market-segmented reporting layer. The GA4 connector is the simplest — it uses a well-documented Google API with two official Node.js packages. The market system is the most architecturally significant because it requires new DB tables, a campaign-to-market assignment mechanism, changes to the scoring worker, and UI changes across all report pages.

The key insight that shapes the entire phase is that market isolation (MRKT-03) cannot be achieved simply by filtering queries after the fact. The Python analysis engine must receive market-partitioned metrics; otherwise a US spend spike literally corrupts AU revenue lift scores because the models are fit on combined data. The `marketId` scaffold already exists on `incrementality_scores` (Phase 3 STAT-05 scaffold), but the worker currently passes `NULL`. Phase 5 fills in this scaffold.

The GA4 OAuth flow is independent from Google Ads OAuth: it uses a different scope (`analytics.readonly`), hits the GA4 Admin API to list key events, then uses the GA4 Data API to pull daily event counts. Both can reuse the existing `integrations` table with `platform='ga4'`, the existing `saveIntegration()` helper, and the existing AES-256-GCM encryption. The outcome mode choice (ecommerce vs lead-gen) is stored on the `tenants` table as a new `outcomeMode` column and gates the UI language throughout the dashboard.

**Primary recommendation:** Build in four sequential plan groups: (1) DB schema — markets table, campaign_markets join table, tenant outcome mode column, (2) GA4 connector + OAuth flow, (3) market detection from existing sync data + market scoring isolation in worker, (4) UI changes — market selector in AppHeader, market-aware API routes, lead-gen terminology toggle.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google-analytics/admin` | 9.0.1 | List GA4 key events (conversion events) via Admin API | Official Google client library; uses `listKeyEventsAsync` for paginated iteration |
| `@google-analytics/data` | 5.2.1 | Pull daily GA4 event counts via Data API runReport | Official Google client library; BetaAnalyticsDataClient exposes runReport |
| `google-ads-api` | ^23.0.0 | Fetch campaign geo targeting via GAQL | Already in ingestion package; extend existing GoogleAdsConnector |
| Drizzle ORM | 0.45.1 | New markets schema + migration | Already used throughout; follow existing migration naming pattern |
| Zustand | ^5.0.11 | Market filter state persisted across navigation | Already in dashboard store; extend `useDashboardStore` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `facebook-nodejs-business-sdk` | ^23.0.0 | Read Meta campaign geo targeting | Already in ingestion; read `targeting.geo_locations.countries` field on AdSets |
| `zod` | ^3.0.0 | Validate GA4 API responses | Already used in all normalizers; follow same pattern |
| `p-retry` | ^6.0.0 | Retry GA4 API calls | Already used in google-ads and shopify connectors |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google-analytics/admin` + `@google-analytics/data` | `googleapis` unified library | `googleapis` works but requires more boilerplate; official single-purpose packages are cleaner and better typed |
| New `markets` DB table | JSON column on `tenants` | JSON column would make querying campaign counts by market impossible; separate table is required for MRKT-01 confidence indicators |
| Zustand for market filter | URL search params | URL params would require updating all link hrefs; Zustand persist already exists in the codebase for viewMode |

**Installation (add to `packages/ingestion`):**
```bash
pnpm add @google-analytics/admin @google-analytics/data
```

---

## Architecture Patterns

### Recommended Project Structure

New files required:

```
packages/
  db/
    src/schema/
      markets.ts                  # NEW: markets + campaign_markets tables
    migrations/
      0004_markets_and_ga4.sql    # NEW: migration for Phase 5 schema
  ingestion/
    src/connectors/
      ga4.ts                      # NEW: GA4 connector (Admin API + Data API)
    src/normalizers/
      ga4.ts                      # NEW: GA4 event counts -> campaign_metrics
    src/market-detection/
      index.ts                    # NEW: detect markets from synced campaign data
      google-ads.ts               # NEW: GAQL campaign_criterion geo query
      meta.ts                     # NEW: Meta AdSet geo_locations extractor

apps/
  web/
    app/api/oauth/ga4/
      route.ts                    # NEW: GA4 OAuth initiation
      callback/route.ts           # NEW: GA4 OAuth callback + event selection prompt
    app/api/ga4/
      events/route.ts             # NEW: GET list of GA4 key events for tenant
    app/api/markets/
      route.ts                    # NEW: GET detected markets / PUT confirm markets
    app/api/dashboard/kpis/
      route.ts                    # EXTEND: add optional ?marketId= filter
    components/
      onboarding/
        MarketConfirmationStep.tsx # NEW: editable market list with confidence indicators
        GA4EventSelector.tsx       # NEW: checklist of GA4 key events
      layout/
        MarketSelector.tsx         # NEW: dropdown in AppHeader
    lib/store/
      dashboard.ts                # EXTEND: add selectedMarket state + setter
```

### Pattern 1: GA4 OAuth Flow

GA4 requires a **separate** OAuth authorization from Google Ads. Even though both use Google accounts, GA4 uses `analytics.readonly` scope while Google Ads uses `https://www.googleapis.com/auth/adwords`. Do NOT combine them in the same OAuth request — users may have GA4 access under a different Google account than their Google Ads login.

**Flow:**
1. `GET /api/oauth/ga4` — redirect to Google OAuth with `analytics.readonly` scope
2. `GET /api/oauth/ga4/callback` — exchange code, call Admin API to list GA4 properties, save integration row with `platform='ga4'`
3. Client redirects to GA4EventSelector component — loads events from `GET /api/ga4/events`
4. User selects events → stored in `integrations.metadata.selectedEventNames: string[]`

```typescript
// Source: Official Google OAuth docs + codebase pattern from apps/web/app/api/oauth/google/route.ts
// GET /api/oauth/ga4/route.ts
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // required for refresh_token
```

**Key difference from Google Ads OAuth:** GA4 does not use a developer token. The `@google-analytics/admin` client handles auth via the access token directly.

### Pattern 2: GA4 Key Events List

Use `@google-analytics/admin` Admin API to enumerate all key events (what GA4 calls conversion events). The `conversionEvents` endpoint is deprecated — use `keyEvents`.

```typescript
// Source: github.com/googleapis/google-cloud-node - list_key_events.js
// packages/ingestion/src/connectors/ga4.ts
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';

const adminClient = new AnalyticsAdminServiceClient({
  authClient: // OAuth2Client with user's access token
});

const keyEvents = [];
for await (const event of adminClient.listKeyEventsAsync({
  parent: `properties/${propertyId}`,
})) {
  keyEvents.push({ name: event.eventName, countingMethod: event.countingMethod });
}
```

The response `eventName` field contains names like `'purchase'`, `'generate_lead'`, `'submit_form'` — these are what the user selects in the checklist UI.

### Pattern 3: GA4 Data API — Pull Daily Lead Counts

Use `@google-analytics/data` BetaAnalyticsDataClient with `runReport`. Filter by `eventName` to get counts only for the user's selected events. Sum across selected events for "total leads per day".

```typescript
// Source: developers.google.com/analytics/devguides/reporting/data/v1/basics
// packages/ingestion/src/connectors/ga4.ts
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const dataClient = new BetaAnalyticsDataClient({ authClient });

const [response] = await dataClient.runReport({
  property: `properties/${propertyId}`,
  dimensions: [{ name: 'date' }, { name: 'eventName' }],
  metrics: [{ name: 'eventCount' }],
  dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
  dimensionFilter: {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: selectedEventNames },
    },
  },
});

// Sum eventCount across all selected events per date
const dailyCounts = new Map<string, number>();
for (const row of response.rows ?? []) {
  const date = row.dimensionValues?.[0].value!;   // 'YYYYMMDD' format — convert to ISO
  const count = parseInt(row.metricValues?.[0].value ?? '0', 10);
  dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + count);
}
```

**Critical detail:** GA4 Data API returns dates in `'YYYYMMDD'` format (no hyphens). Convert to `'YYYY-MM-DD'` before writing to `campaign_metrics`.

### Pattern 4: Google Ads Geo Targeting — Two-Query Approach

GAQL does not support JOINs across resources. Fetching geo targeting for campaigns requires two sequential queries:

**Query 1: Get campaign-to-geo-target-constant mapping**
```sql
-- packages/ingestion/src/market-detection/google-ads.ts
SELECT
  campaign.id,
  campaign.name,
  campaign_criterion.location.geo_target_constant,
  campaign_criterion.negative
FROM campaign_criterion
WHERE campaign_criterion.type = 'LOCATION'
  AND campaign_criterion.negative = FALSE
```

**Query 2: Resolve geo_target_constant resource names to country codes**
```sql
SELECT
  geo_target_constant.resource_name,
  geo_target_constant.name,
  geo_target_constant.country_code,
  geo_target_constant.target_type
FROM geo_target_constant
WHERE geo_target_constant.resource_name IN (
  'geoTargetConstants/2036',
  'geoTargetConstants/2840'
)
```

The `country_code` field returns ISO 3166-1 alpha-2 codes (e.g., `'AU'`, `'US'`, `'GB'`). Only `target_type = 'Country'` rows map directly to the country-level market granularity required. City, region, and postal codes must be resolved up to their parent country.

### Pattern 5: Meta Ads Geo Targeting

Meta stores targeting at the **ad set** level, not the campaign level. The `facebook-nodejs-business-sdk` AdSet object has a `targeting` field with `geo_locations.countries` containing an array of ISO 2-letter country codes. Campaign-level geo is inferred by aggregating across all ad sets within a campaign.

```typescript
// Source: Meta Marketing API docs + codebase
// packages/ingestion/src/market-detection/meta.ts

// Existing meta connector fetches campaigns; extend to also fetch ad sets targeting
const adSets = await adAccount.getAdSets(
  ['id', 'campaign_id', 'targeting'],
  { limit: 100 }
);

// Extract countries from each ad set
for (const adSet of adSets) {
  const countries: string[] = adSet.targeting?.geo_locations?.countries ?? [];
  // Associate countries with campaign
}
```

**Important:** Meta ad sets may target cities or regions rather than countries. The `geo_locations.countries` array will be empty in that case. These campaigns go into "Global/Unassigned" bucket — the user assigns them manually.

### Pattern 6: Markets DB Schema

Two new tables are needed. Follow the exact Drizzle + RLS pattern from `packages/db/src/schema/campaigns.ts`.

```typescript
// packages/db/src/schema/markets.ts

// Table 1: Tenant markets (confirmed by user)
export const markets = pgTable('markets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),  // ISO 3166-1 alpha-2: 'AU', 'US', 'GB'
  displayName: text('display_name').notNull(),  // User-editable: 'Australia', 'United States'
  campaignCount: numeric('campaign_count', { precision: 8, scale: 0 }).default('0'),
  isConfirmed: boolean('is_confirmed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', { ... }),
]);

// Table 2: Campaign-to-market assignment (many-to-many)
export const campaignMarkets = pgTable('campaign_markets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(), // references campaigns.id
  marketId: uuid('market_id'),               // NULL = Global/Unassigned
  source: text('source').notNull(),          // 'auto_detected' | 'user_assigned'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('campaign_markets_unique').on(t.tenantId, t.campaignId),
  pgPolicy('tenant_isolation', { ... }),
]);
```

**Also extend `tenants` table:**
```typescript
// Add to packages/db/src/schema/tenants.ts
outcomeMode: text('outcome_mode').default('ecommerce').notNull(), // 'ecommerce' | 'lead_gen'
```

### Pattern 7: Market-Filtered API Queries

All existing dashboard API routes in `apps/web/app/api/dashboard/` accept `tenantId` in query params. For market filtering, add an optional `marketId` param. When `marketId` is provided, JOIN through `campaign_markets` to filter `campaign_metrics`.

```typescript
// Example: extend GET /api/dashboard/kpis/route.ts
const marketId = searchParams.get('marketId'); // null = all markets

const baseQuery = tx
  .select({ ... })
  .from(campaignMetrics);

if (marketId) {
  // Join campaign_markets to filter by market
  baseQuery.innerJoin(
    campaignMarkets,
    and(
      eq(campaignMarkets.campaignId, campaignMetrics.campaignId),
      eq(campaignMarkets.marketId, marketId),
    )
  );
}
```

### Pattern 8: Outcome Mode — Lead Terminology in UI

The `tenants.outcomeMode` column gates the display language. Where the dashboard shows "Revenue" or "Incremental Revenue", lead-gen mode shows "Leads" or "Incremental Leads". This is a UI-layer concern only — the underlying metric values are identical (stored in the same `directConversions` and `modeledConversions` columns of `campaign_metrics`).

The dashboard store already holds global state. Add `outcomeMode: 'ecommerce' | 'lead_gen'` to the Zustand store (loaded from `/api/tenant/preferences` on mount). All display-layer components read `outcomeMode` from the store to select terminology strings.

### Pattern 9: Market Selector in AppHeader

Extend `AppHeader.tsx` to include a `MarketSelector` dropdown after the `ViewToggle`. Follow the same pattern used for `ExportButton` — prop-driven from the dashboard layout.

For single-market tenants: hide the selector entirely (no rendering, no space allocation). Detect this by checking `markets.length <= 1` in a `useMarkets()` hook.

```typescript
// apps/web/components/layout/MarketSelector.tsx
// Reads markets from useDashboardStore().markets
// Updates selectedMarket via setSelectedMarket()
// "All Markets" = null, specific market = UUID string
```

### Pattern 10: GA4 Leads as Outcome in Analysis

GA4 lead counts are stored in `campaign_metrics.directConversions` (not `directRevenue`) for lead-gen tenants. The Python analysis engine's `IncrementalityRequest` already uses a generic `revenue` field in `MetricRow` — for lead-gen tenants, pass `directConversions` as the `revenue` field. The scoring worker in `packages/ingestion/src/scoring/worker.ts` must check `tenant.outcomeMode` when building `MetricRow` arrays before calling the Python sidecar.

### Anti-Patterns to Avoid

- **Combining GA4 OAuth with Google Ads OAuth:** These are separate integrations with separate scopes and may be authorized by different Google accounts.
- **Fetching geo from campaign level on Meta:** Meta geo targeting lives on ad sets, not campaigns. Campaign-level geo targeting on Meta does not exist in the API.
- **Relying on a single GAQL JOIN to get country codes:** GAQL does not support JOINs. Always use the two-query approach (campaign_criterion then geo_target_constant).
- **Storing GA4 dates as returned:** GA4 Data API returns dates as `'YYYYMMDD'` (no hyphens). Always normalize to `'YYYY-MM-DD'` before DB writes.
- **Market filtering in the Python sidecar:** Do not add market filtering inside the Python analysis engine. Filter metrics before sending to Python. The existing `IncrementalityRequest` schema does not need to change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GA4 key events list | Manual REST calls to Analytics Admin REST API | `@google-analytics/admin` `listKeyEventsAsync` | Handles OAuth token injection, pagination, retry |
| GA4 event count reporting | Manual REST calls to GA4 Data API | `@google-analytics/data` `BetaAnalyticsDataClient.runReport` | Handles quota management, response parsing, field typing |
| ISO 3166 country code display names | Manual lookup table | Pre-built `Intl.DisplayNames` Web API | `new Intl.DisplayNames(['en'], { type: 'region' }).of('AU')` returns `'Australia'` — zero dependencies |
| GA4 OAuth token refresh | Custom refresh logic | Reuse `saveIntegration()` + existing refresh patterns | AES-256-GCM encryption, timing-safe HMAC state already in `lib/oauth-helpers.ts` |

**Key insight:** The `Intl.DisplayNames` API provides country name lookup without any npm package. Use it to convert `'AU'` → `'Australia'` for the market confirmation UI. Available in Node.js 12+ and all modern browsers.

```typescript
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
regionNames.of('AU'); // 'Australia'
regionNames.of('US'); // 'United States'
```

---

## Common Pitfalls

### Pitfall 1: GA4 Data API Date Format
**What goes wrong:** Storing GA4 dates directly as returned causes silent data corruption or broken queries. GA4 returns `'20250115'` not `'2025-01-15'`.
**Why it happens:** The GA4 Data API uses its own date format, unlike all other platform APIs in this codebase which use ISO format.
**How to avoid:** In the GA4 normalizer, always transform: `date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')` before any DB write.
**Warning signs:** `campaign_metrics.date` comparison queries returning zero rows despite data existing.

### Pitfall 2: GA4 Quotas
**What goes wrong:** GA4 Data API has daily quota limits: 50,000 requests per project per day and 10 requests per second per property. Backfilling 3 years of daily data (1,095 days) with a per-request date range is fine, but polling per-event per-day would exceed quotas.
**Why it happens:** Requests that are too granular (one API call per event per day).
**How to avoid:** Use `dimensionFilter.inListFilter` to fetch ALL selected events in a single `runReport` call, grouping by both `date` and `eventName`. One API call per date-range chunk, not one per event.
**Warning signs:** 429 errors with `quotaExceeded` in the error body.

### Pitfall 3: Meta Geo at Ad Set Level
**What goes wrong:** Querying the Meta `Campaign` object for geo targeting returns no location data.
**Why it happens:** Meta's ad structure puts targeting on ad sets, not campaigns. This is by design.
**How to avoid:** Always query `AdSet` objects and aggregate their `targeting.geo_locations.countries` up to the campaign level. A campaign's market is the union of all its ad sets' countries.
**Warning signs:** All Meta campaigns landing in "Global/Unassigned" despite having clearly geo-targeted ads.

### Pitfall 4: Google Ads City/Region Targets Misidentified as Countries
**What goes wrong:** A campaign targeting "Sydney, Australia" gets a `geo_target_constant` with `target_type='City'`, not `'Country'`. If you only check `country_code`, it correctly shows `'AU'` — but if you try to use resource names as market keys, cities and countries are mixed.
**Why it happens:** `geo_target_constant.country_code` exists on ALL geo constants, not just country-level ones. A city constant has `country_code='AU'` and `target_type='City'`.
**How to avoid:** For market assignment, use only the `country_code` field regardless of `target_type`. The country code is correct on all geo constants. Do not attempt to filter by `target_type='Country'` — just read `country_code` from whatever constants are returned and group campaigns by that code.
**Warning signs:** Campaigns showing incorrect market assignment or markets showing unexpected campaign counts.

### Pitfall 5: GA4 Property Selection
**What goes wrong:** A Google account may have access to multiple GA4 properties (one per website/app). The user connects via OAuth but the system doesn't know which property to query.
**Why it happens:** GA4 is property-centric, not account-centric like Google Ads.
**How to avoid:** After OAuth callback, list available properties using `analyticsAdminClient.listProperties()` and present a property selection UI step before the key event checklist. Store the selected `propertyId` in `integrations.metadata.propertyId`.

### Pitfall 6: Cross-Market Analysis Contamination
**What goes wrong:** The Python scoring worker receives combined AU+US metrics for a campaign, fits an ITS model on the full series, and reports a spurious lift signal when a US budget spike coincides with AU revenue.
**Why it happens:** Current scoring worker in `packages/ingestion/src/scoring/worker.ts` does not filter by market when fetching metrics.
**How to avoid:** For market-aware scoring, the worker must split a campaign's metric data by market and run a **separate** incrementality request per market. The resulting score rows are stored with the appropriate `marketId` in `incrementality_scores`. When querying "overall" scores (null `marketId`), use the combined-market row (kept for single-market tenants or overall rollups).
**Warning signs:** `incrementality_scores.market_id IS NULL` for all rows even after Phase 5 ships (means the worker wasn't updated).

### Pitfall 7: Analysis Recompute Scope on Event Selection Change
**What goes wrong:** User changes their GA4 event selection (adds "contact_form_submit", removes "phone_call"). If only future data is re-queried, historical incrementality scores remain based on wrong lead counts.
**Why it happens:** Changing the "what counts as a lead" definition changes ALL historical data meaning, not just future data.
**How to avoid:** When event selections change:
1. Store snapshot of old scores in a `ga4_event_selection_history` table (or mark current scores with a `selection_version` column) for the comparison view
2. Re-pull GA4 data from scratch (re-query Data API for full historical date range)
3. Re-run full scoring pipeline for all campaigns
This is expensive but correctness requires it. Implement as a background BullMQ job.

---

## Code Examples

Verified patterns from official sources:

### GA4 Admin API — List Key Events
```typescript
// Source: github.com/googleapis/google-cloud-node/packages/google-analytics-admin/samples/generated/v1beta/analytics_admin_service.list_key_events.js
// packages/ingestion/src/connectors/ga4.ts

import { AnalyticsAdminServiceClient } from '@google-analytics/admin';

async function listKeyEvents(accessToken: string, propertyId: string) {
  // Initialize client with user's OAuth token
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth();
  const authClient = await auth.fromJSON({
    type: 'authorized_user',
    access_token: accessToken,
  });

  const adminClient = new AnalyticsAdminServiceClient({ authClient });

  const keyEvents: Array<{ eventName: string; countingMethod: string }> = [];
  for await (const event of adminClient.listKeyEventsAsync({
    parent: `properties/${propertyId}`,
  })) {
    keyEvents.push({
      eventName: event.eventName ?? '',
      countingMethod: event.countingMethod ?? 'ONCE_PER_EVENT',
    });
  }
  return keyEvents;
}
```

### GA4 Data API — Daily Event Count Report
```typescript
// Source: developers.google.com/analytics/devguides/reporting/data/v1/basics
// packages/ingestion/src/connectors/ga4.ts

import { BetaAnalyticsDataClient } from '@google-analytics/data';

async function fetchLeadCounts(
  accessToken: string,
  propertyId: string,
  selectedEventNames: string[],
  dateRange: { start: string; end: string }
): Promise<Map<string, number>> {
  const dataClient = new BetaAnalyticsDataClient({ authClient });

  const [response] = await dataClient.runReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'date' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: selectedEventNames },
      },
    },
  });

  const dailyCounts = new Map<string, number>();
  for (const row of response.rows ?? []) {
    // GA4 returns 'YYYYMMDD' — convert to 'YYYY-MM-DD'
    const rawDate = row.dimensionValues?.[0].value ?? '';
    const date = rawDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    const count = parseInt(row.metricValues?.[0].value ?? '0', 10);
    dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + count);
  }
  return dailyCounts;
}
```

### GAQL: Campaign Geo Targeting
```typescript
// Source: developers.google.com/google-ads/api/docs/targeting/location-targeting
// packages/ingestion/src/market-detection/google-ads.ts

// Query 1: Get campaign → geo constant mappings (non-negative location targets)
const criterionQuery = `
  SELECT
    campaign.id,
    campaign.name,
    campaign_criterion.location.geo_target_constant,
    campaign_criterion.negative
  FROM campaign_criterion
  WHERE campaign_criterion.type = 'LOCATION'
    AND campaign_criterion.negative = FALSE
`;

const criterionResults = await customer.query(criterionQuery);
const geoConstantResourceNames = new Set(
  criterionResults.map(r => r.campaign_criterion?.location?.geo_target_constant)
    .filter(Boolean)
);

// Query 2: Resolve constants to country codes
const constants = [...geoConstantResourceNames];
if (constants.length > 0) {
  const inClause = constants.map(c => `'${c}'`).join(', ');
  const geoQuery = `
    SELECT
      geo_target_constant.resource_name,
      geo_target_constant.country_code
    FROM geo_target_constant
    WHERE geo_target_constant.resource_name IN (${inClause})
  `;
  const geoResults = await customer.query(geoQuery);
  // Build: Map<resourceName, countryCode>
}
```

### Country Name from ISO Code (zero dependency)
```typescript
// Built-in Web API — no npm package needed
// Works in Node.js 12+ and all modern browsers
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function getCountryDisplayName(countryCode: string): string {
  return regionNames.of(countryCode) ?? countryCode;
}

getCountryDisplayName('AU');  // 'Australia'
getCountryDisplayName('US');  // 'United States'
getCountryDisplayName('GB');  // 'United Kingdom'
```

### Extending Zustand Dashboard Store for Market Filter
```typescript
// Source: existing codebase pattern in apps/web/lib/store/dashboard.ts
// Add to DashboardState interface:

selectedMarket: string | null;     // null = 'All Markets'
markets: Array<{ id: string; countryCode: string; displayName: string }>;

// Add setters:
setSelectedMarket: (marketId: string | null) => void;
setMarkets: (markets: DashboardState['markets']) => void;

// In persist config, add selectedMarket to partialize:
partialize: (state) => ({
  viewMode: state.viewMode,
  kpiOrder: state.kpiOrder,
  selectedMarket: state.selectedMarket, // persist market selection
}),
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GA4 `conversionEvents.list` endpoint | GA4 `keyEvents.list` endpoint | 2023 (GA4 rebranding of conversion events) | `conversionEvents.*` methods are deprecated; always use `keyEvents.*` |
| `analytics.edit` scope for read operations | `analytics.readonly` scope | Always supported | Phase 5 only needs read access; do NOT request edit scope |
| Querying geo targets from `location_view` with metrics | Two-step: `campaign_criterion` + `geo_target_constant` | Stable | `location_view` gives performance metrics by geo; `campaign_criterion` gives targeting intent — we want intent, not where clicks happened |

**Deprecated/outdated:**
- `properties.conversionEvents.list`: Deprecated in favor of `properties.keyEvents.list`. The old endpoint still works but should not be used in new code.
- Requesting `analytics.edit` scope when only reading data: Over-permissioned, will fail Google OAuth verification.

---

## Open Questions

1. **GA4 Property Listing After OAuth**
   - What we know: After GA4 OAuth callback, we have an access token valid for `analytics.readonly`; `analyticsAdminClient.listProperties()` can enumerate all properties the user has access to
   - What's unclear: Does `listProperties()` require a "parent" (organization/account resource name) or can it list all properties flat? For users with many properties, this could be a long list.
   - Recommendation: Call `listProperties()` with no parent filter to get all properties; present them as a dropdown in the onboarding step after OAuth. If only one property exists, auto-select it.

2. **GA4 Backfill Data Availability**
   - What we know: GA4 Data API allows querying historical data; GA4 properties may only have data from the date they were created
   - What's unclear: What happens if a user connects GA4 but their property only has 6 months of data (below ARCH-03's 1-year minimum)?
   - Recommendation: For lead-gen tenants, apply the same ARCH-03 gate (1-year minimum) using GA4 data length; if insufficient, show a "GA4 data too young" warning rather than blocking the onboarding. Lead-gen mode with limited data produces low-confidence scores — communicate this clearly.

3. **Market Detection for Google Analytics Campaign Source**
   - What we know: GA4 tracks sessions from campaigns via UTM parameters; the Data API can return `sessionCampaignName` dimension
   - What's unclear: Should GA4 data also inform market detection, or is geo detection purely from the ad platform campaign targeting metadata?
   - Recommendation: Detect markets only from ad platform metadata (Google Ads geo targeting + Meta ad set countries). GA4 data is the outcome source, not the geo source. Keep concerns separated.

4. **Recompute + Comparison UX for Changed Event Selections**
   - What we know: When the user changes selected events, recompute analysis from scratch AND keep old analysis for comparison (locked decision)
   - What's unclear: What exactly does "keep old analysis available" mean in DB terms — a duplicate set of score rows with a different selection version? A snapshot table?
   - Recommendation: Add a `selectionVersion` integer column to `incrementality_scores`. When event selections change, increment the version and re-score; old rows with prior versions remain queryable. The comparison UI shows "current selection" vs "previous selection" scores side by side. Keep at most 2 versions to avoid unbounded growth.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to `true` in `.planning/config.json` — skipping this section.

---

## Sources

### Primary (HIGH confidence)
- `developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents/list` — GA4 Admin API key events endpoint, authorization scopes
- `developers.google.com/analytics/devguides/reporting/data/v1/basics` — GA4 Data API runReport Node.js examples
- `github.com/googleapis/google-cloud-node/packages/google-analytics-admin/samples/generated/v1beta/analytics_admin_service.list_key_events.js` — Official `@google-analytics/admin` listKeyEventsAsync pattern
- `developers.google.com/google-ads/api/docs/targeting/location-targeting` — Campaign geo targeting GAQL query structure
- `npm view @google-analytics/data version` → `5.2.1` (verified live)
- `npm view @google-analytics/admin version` → `9.0.1` (verified live)
- Codebase: `packages/db/src/schema/incrementality-scores.ts` — marketId scaffold (Phase 3 STAT-05 comment confirmed)
- Codebase: `packages/db/src/schema/campaigns.ts` — Drizzle + RLS pattern to replicate for markets tables
- Codebase: `packages/ingestion/src/connectors/google-ads.ts` — Existing GAQL query pattern to extend
- Codebase: `apps/web/lib/store/dashboard.ts` — Zustand persist pattern to extend for market filter state

### Secondary (MEDIUM confidence)
- `developers.google.com/google-ads/api/docs/oauth/overview` — Google Ads OAuth overview (GA4 vs Ads scopes separation confirmed implicitly)
- WebSearch: GA4 `analytics.readonly` scope confirmed for Data API and Admin API read operations
- WebSearch: Meta geo targeting is on AdSet not Campaign (confirmed via multiple developer sources)
- WebSearch: `geo_target_constant.country_code` field confirmed via Google Ads API field documentation

### Tertiary (LOW confidence)
- `developers.google.com/analytics/devguides/config/admin/v1/rest` — `listProperties()` behavior without parent filter not directly verified in official docs; inferred from API structure

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages verified via npm, official Google docs confirm API structures
- Architecture: MEDIUM-HIGH — patterns derived from official docs + existing codebase analysis; GA4 property listing flow is inferred
- Pitfalls: HIGH — GA4 date format and Meta geo-on-adset are well-documented gotchas; Google Ads two-query requirement is explicitly stated in official docs

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — GA4 and Google Ads APIs are stable; `@google-analytics/admin` v9 is major, check for breaking changes if planning extends past March)
