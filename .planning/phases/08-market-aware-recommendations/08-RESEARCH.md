# Phase 8: Market-Aware Recommendations - Research

**Researched:** 2026-02-26
**Domain:** API query filtering, client-side state management, React hook composition, Zustand store
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Filtering behavior:**
- Default view (no market selected) shows recommendations from all markets combined
- Instant refresh when MarketSelector changes — no apply button
- Client-side filtering first: filter the already-loaded recommendation set in the browser
- Server-side filtering via API marketId parameter for when fresh data is needed from the engine
- Switching back to "All Markets" restores the cached full set instantly (no re-fetch)

**API contract:**
- Add optional marketId query parameter to /api/recommendations (satisfies MRKT-04)
- When marketId is provided, the recommendation engine filters at generation time — only campaigns from that market feed into the statistical engine
- Response shape includes full market summary metadata when filtered: marketName, campaignCount, dateRange, totalSpend
- When no marketId is provided, response shape remains unchanged (backwards compatible)

**Dashboard integration:**
- Subtle text label above recommendations showing filter state (e.g., "Filtered: US Market (12 campaigns)")
- Loading behavior: instant swap for client-side cached data, skeleton loaders only when fetching fresh recommendations from the API
- Market selection persists in session state across page navigations (resets on logout)
- Each recommendation card displays a small market badge/tag showing which market it belongs to — useful in "All Markets" view

**Edge cases:**
- Empty market (no campaigns): show cross-market suggestions with a note like "No recommendations for this market — here are top picks from other markets"
- Single-market users: hide MarketSelector entirely, show recommendations for that market automatically (MarketSelector already hides when `markets.length <= 1`)
- Deleted/empty selected market: gracefully fall back to "All Markets" view with a brief toast notification
- Low-data markets: show a subtle warning like "Limited data — recommendations may improve as more campaigns are added" when a market has very few campaigns

### Claude's Discretion
- Exact threshold for "low data" warning (number of campaigns)
- Skeleton loader design and animation
- Toast notification duration and styling
- Market badge color/design on recommendation cards

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MRKT-04 | All reports and analysis can be segmented by market | Engine already has marketId param plumbing; requires bug fix in Drizzle chain + client-side hook wiring + card badge + filter label UI |
</phase_requirements>

## Summary

Phase 8 is primarily a **wiring and polish phase** — the foundational plumbing is substantially in place but contains a critical bug and several missing connections. The backend infrastructure (schema, API route, engine function signature) was scaffolded in earlier phases. The Zustand store already persists `selectedMarket`. The gap is: (1) a Drizzle query builder bug breaks server-side filtering, (2) `useRecommendations` does not pass `selectedMarket` to the API, (3) the `Recommendation` type lacks `marketId`/`marketName` fields needed for card badges, and (4) the dashboard page has no filter state label or empty-market UX.

The client-side filtering strategy (filter the cached full set instantly, re-fetch only when fresh API data is requested) must be implemented in `useRecommendations` using TanStack Query's `select` option — this avoids a network round-trip when `selectedMarket` changes while keeping the cache coherent. The full set is always fetched and cached under `['recommendations']`; filtered views derive from it via `select`.

The market badge on cards requires adding `marketId` and `marketName` to the `Recommendation` type and populating them in the engine. This requires a LEFT JOIN on `campaign_markets` + `markets` in `generateRecommendations` even for the unfiltered path. The market summary metadata (marketName, campaignCount, dateRange, totalSpend) only appears in the API response when `marketId` is provided.

**Primary recommendation:** Fix the Drizzle `.innerJoin()` chain bug first; then wire `selectedMarket` into `useRecommendations`; then add market badge to type + engine + cards; then add filter label + edge case UX to the dashboard page.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | existing (packages/db) | Server-side query building with marketId INNER JOIN | Already used throughout project; withTenant pattern established |
| Zustand | existing (apps/web) | Client-side selectedMarket state | Already wired in dashboard store with persist middleware |
| TanStack Query | existing (apps/web) | Data fetching + client-side filtering via `select` option | Already used for all API hooks; `select` is the correct derivation primitive |
| sonner / shadcn Toast | existing (apps/web) | Toast notification for deleted-market fallback | shadcn already installed; use existing toast pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn Badge | existing | Market badge on recommendation cards | Small pill label showing market name |
| shadcn Skeleton | existing | Loading placeholder for skeleton loaders | When fetching fresh API data after market switch |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Query `select` for client filtering | Separate `useMemo` in page component | `select` keeps filtering co-located with the hook, avoids prop drilling; `useMemo` is fine but splits concerns across file boundary |
| Always re-fetch on market change | Client-side filter from cached full set | Re-fetch causes unnecessary latency; client filter is instant; server-side re-fetch reserved for explicit "refresh" or initial load |

**Installation:** No new packages needed. All libraries are already installed.

## Architecture Patterns

### Recommended Project Structure

No new files or directories needed. All changes are in-place edits to existing files.

```
apps/web/
├── lib/
│   ├── recommendations/
│   │   ├── engine.ts          # Fix Drizzle chain bug; add market fields to query
│   │   └── types.ts           # Add marketId?, marketName? to Recommendation
│   └── hooks/
│       └── useRecommendations.ts  # Add market-aware filtering + query key
├── app/api/recommendations/
│   └── route.ts               # Already correct — passes marketId to engine
├── app/(dashboard)/
│   └── page.tsx               # Add filter label + empty-market UX
└── components/recommendations/
    ├── RecommendationCard.tsx         # Add market badge
    ├── RecommendationAnalystCard.tsx  # Add market badge
    └── LowConfidenceCard.tsx          # Add market badge (optional, lower priority)
```

### Pattern 1: Drizzle Query Builder Chain (CRITICAL BUG FIX)

**What:** Drizzle query builder methods return a new builder on each call — they are NOT mutating in-place. The current code calls `query.innerJoin(...)` without assigning the result, so the join is silently discarded.

**Current broken code (engine.ts lines 321–329):**
```typescript
// BUG: .innerJoin() return value is discarded — market filter has NO effect
if (marketId) {
  query.innerJoin(              // <-- result never assigned
    campaignMarkets,
    and(
      eq(campaignMarkets.campaignId, incrementalityScores.campaignId),
      eq(campaignMarkets.marketId, marketId),
    ),
  );
}
```

**Fix — build the full query conditionally before executing:**
```typescript
// Source: Drizzle ORM query builder pattern (immutable chain)
const baseQuery = tx
  .select({ ... })
  .from(incrementalityScores)
  .innerJoin(campaigns, and(...));

// Conditionally extend the chain — always reassign
const filteredQuery = marketId
  ? baseQuery.innerJoin(
      campaignMarkets,
      and(
        eq(campaignMarkets.campaignId, incrementalityScores.campaignId),
        eq(campaignMarkets.marketId, marketId),
      ),
    )
  : baseQuery;

return filteredQuery.where(...).orderBy(...);
```

**Confidence:** HIGH — this is a documented Drizzle immutable builder pattern. The current code provably does nothing for market filtering.

### Pattern 2: TanStack Query `select` for Client-Side Filtering

**What:** Always fetch the full recommendation set under a stable query key. Derive the filtered view using TanStack Query's `select` option, which transforms the cached data without triggering a re-fetch.

**When to use:** When the source data is small enough to filter in-browser (recommendation lists are O(10–100) items) and you want instant UI response to filter changes.

**Example:**
```typescript
// Source: TanStack Query docs — select option for derived/filtered data
export function useRecommendations() {
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);
  const markets = useDashboardStore((s) => s.markets);

  return useQuery<Recommendation[], Error, Recommendation[]>({
    queryKey: ['recommendations'],          // stable key — full set always cached here
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error(`Failed to fetch recommendations: ${res.status}`);
      return res.json() as Promise<Recommendation[]>;
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      // Client-side filter — instant, no re-fetch
      if (!selectedMarket) return data;
      return data.filter((r) => r.marketId === selectedMarket);
    },
  });
}
```

**Important nuance:** The `select` function runs on every render when `selectedMarket` changes. This is intentional — it gives instant UI response. The network fetch only fires on cache miss or stale data. Switching back to "All Markets" (`selectedMarket = null`) instantly restores the full set from cache.

**Confidence:** HIGH — TanStack Query `select` is the documented pattern for derived data from cached queries.

### Pattern 3: Market Fields on Recommendation Type + Engine Population

**What:** Add `marketId` and `marketName` to the `Recommendation` type so cards can show a market badge in "All Markets" view. The engine populates these via a LEFT JOIN on `campaign_markets` + `markets`.

**Type addition:**
```typescript
// lib/recommendations/types.ts
export interface Recommendation {
  // ...existing fields...

  // Market context — populated when campaign is assigned to a market
  marketId?: string;        // UUID from campaign_markets.market_id (null = Global/Unassigned)
  marketName?: string;      // Human-readable: "United States", "Australia"
  marketCountryCode?: string;  // For flag emoji: "US", "AU"
}
```

**Engine addition (within generateRecommendations):**
The engine needs to LEFT JOIN `campaign_markets` and `markets` tables to get market info per campaign. This is a secondary query (after the main scores query), similar to how saturation is fetched. Fetch a map of `campaignId -> { marketId, marketName, marketCountryCode }` and merge into the final `Recommendation` push.

```typescript
// Step 4b: Get market assignments for badge display
const marketRows: Array<{ campaignId: string; marketId: string | null; displayName: string | null; countryCode: string | null }> =
  await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        campaignId: campaignMarkets.campaignId,
        marketId: campaignMarkets.marketId,
        displayName: markets.displayName,
        countryCode: markets.countryCode,
      })
      .from(campaignMarkets)
      .leftJoin(markets, eq(campaignMarkets.marketId, markets.id))
      .where(
        and(
          eq(campaignMarkets.tenantId, tenantId),
          sql`${campaignMarkets.campaignId} = ANY(ARRAY[${sql.join(
            campaignIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
  });

const marketByCampaign = new Map(
  marketRows.map((r) => [r.campaignId, r]),
);
```

Then in the recommendation push:
```typescript
const marketInfo = marketByCampaign.get(score.campaignId);
recommendations.push({
  id: `rec-${score.campaignId}`,
  campaignId: score.campaignId,
  campaignName: campaign.name,
  platform: campaign.source,
  marketId: marketInfo?.marketId ?? undefined,
  marketName: marketInfo?.displayName ?? undefined,
  marketCountryCode: marketInfo?.countryCode ?? undefined,
  ...classification,
});
```

**Confidence:** HIGH — follows the established engine query pattern for saturation (Steps 3-4).

### Pattern 4: Filter State Label + Empty Market UX

**What:** Subtle label above the recommendations section. Uses the markets array from Zustand store to look up the display name.

**Example (in page.tsx recommendations section):**
```typescript
// Read from store
const selectedMarket = useDashboardStore((s) => s.selectedMarket);
const markets = useDashboardStore((s) => s.markets);
const setSelectedMarket = useDashboardStore((s) => s.setSelectedMarket);

const selectedMarketInfo = markets.find((m) => m.id === selectedMarket);

// Filter label above recommendations h2:
{selectedMarket && selectedMarketInfo && (
  <p className="mb-2 text-xs text-muted-foreground">
    Filtered: {selectedMarketInfo.displayName} ({campaignRecs.length} campaigns)
  </p>
)}

// Empty-market cross-market suggestions:
{selectedMarket && campaignRecs.length === 0 && !recsLoading ? (
  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
    <p className="font-medium">No recommendations for this market</p>
    <p className="mt-1">Here are top picks from other markets:</p>
    {/* render top 3 from full unfiltered set */}
  </div>
) : /* normal render */}
```

**Confidence:** HIGH — pattern follows existing dashboard patterns in the codebase.

### Pattern 5: Market Summary Metadata in API Response (Filtered Mode)

**What:** When `marketId` is provided, the API returns an extended response shape with market summary. When unfiltered, shape is unchanged (backwards compatible).

**Route handler addition:**
```typescript
// route.ts — only compute summary when marketId is provided
if (marketId) {
  // Query market metadata: name, campaign count, spend sum, date range
  const summary = await getMarketSummary(tenantId, marketId);
  return NextResponse.json({ recommendations, marketSummary: summary });
}
return NextResponse.json(recommendations);   // unchanged shape
```

**Note:** The existing route already extracts `marketId` from params and passes it to `generateRecommendations`. This is the only remaining addition for the API contract requirement.

**Confidence:** HIGH — simple conditional response wrapping.

### Anti-Patterns to Avoid

- **Mutating Drizzle query builder in-place:** As described in Pattern 1, always reassign: `query = query.innerJoin(...)`.
- **Adding `marketId` to TanStack Query key for filtering:** Do NOT use `['recommendations', selectedMarket]` as the query key. This would cache a separate network request per market, defeating the client-side filter design. Use stable `['recommendations']` and filter via `select`.
- **Fetching recommendations per market switch:** The locked decision is "client-side filtering first." Only fetch fresh server data when the initial cache is empty or explicitly stale.
- **Undefined marketId passed to SQL:** When `marketId` is null/undefined, the INNER JOIN must not run. Use the `if (marketId)` guard (already present, just needs the assignment fix).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side derived/filtered data | Custom filtering hook | TanStack Query `select` option | Already available, handles memoization, cache coherence automatically |
| Toast notifications | Custom toast component | shadcn Sonner (already in project) | Already used in other components; consistent UX |
| Market name lookup | Re-fetch markets in hook | Read from Zustand store (already populated by `useMarkets`) | Markets are already loaded and in-store; no extra request needed |
| Flag emoji | Custom country-code-to-flag utility | Re-use `countryFlag()` from `MarketSelector.tsx` | Already exists, extract to shared util or inline |

**Key insight:** Almost all the building blocks exist. This phase is wiring, not building. The risk is in the Drizzle bug and missed connections, not in absent infrastructure.

## Common Pitfalls

### Pitfall 1: Drizzle Immutable Builder (Already Hit in Phase 8 Scaffold)
**What goes wrong:** Market filter on server-side has zero effect — all markets are always returned regardless of `marketId` parameter.
**Why it happens:** `query.innerJoin(...)` returns a NEW builder; the old `query` variable is unchanged.
**How to avoid:** Always assign: `const q2 = q1.innerJoin(...)`. Prefer building the full chain conditionally using ternary before the terminal `.where().orderBy()`.
**Warning signs:** Server returns same recommendations whether `marketId` is provided or not.

### Pitfall 2: TanStack Query Key Granularity
**What goes wrong:** Using `['recommendations', selectedMarket]` as queryKey causes a separate network request per market — defeats client-side filtering, causes loading spinners on every switch.
**Why it happens:** TanStack Query treats different keys as independent cache entries.
**How to avoid:** Keep queryKey as `['recommendations']`. Filter via `select` which is applied AFTER cache retrieval, not during fetch.
**Warning signs:** Network tab shows a new request every time market changes.

### Pitfall 3: Missing marketId on Recommendation Type Breaks Client Filter
**What goes wrong:** `data.filter((r) => r.marketId === selectedMarket)` always returns empty because `marketId` is not populated on recommendations.
**Why it happens:** Type has no `marketId` field; engine never fetches or sets it.
**How to avoid:** Add `marketId` to `Recommendation` type AND populate it in the engine query. The filter in `useRecommendations.select` depends on this field existing.
**Warning signs:** Selecting any specific market shows 0 recommendations even when campaigns exist for that market.

### Pitfall 4: Backwards Compatibility on API Response Shape
**What goes wrong:** Existing callers break if the API always returns `{ recommendations, marketSummary }` shape instead of plain `Recommendation[]`.
**Why it happens:** `useRecommendations` calls `res.json() as Promise<Recommendation[]>` — if shape changes unconditionally, type cast is wrong.
**How to avoid:** Only return the wrapped shape when `marketId` is provided. When unfiltered, return plain `Recommendation[]` as before. Update `useRecommendations` to handle both shapes or keep hook to always fetch unfiltered (the hook never needs market summary — that's for the page label).
**Warning signs:** TypeScript errors in `useRecommendations`; runtime `undefined` on `.map()` of recommendations.

### Pitfall 5: selectedMarket Persists Across Sessions But Market May Be Deleted
**What goes wrong:** User selects market "US", logs out, market is deleted, logs back in — `selectedMarket` UUID from localStorage no longer matches any market.
**Why it happens:** `selectedMarket` is persisted to localStorage via Zustand persist.
**How to avoid:** In `useRecommendations` or the page component, after markets load, check if `selectedMarket` exists in `markets[]`. If not, call `setSelectedMarket(null)` and show toast: "Selected market no longer exists — showing all markets."
**Warning signs:** Persistent 0-recommendation state; filter label shows undefined market name.

### Pitfall 6: Low-Data Warning Threshold
**What goes wrong:** Warning appears for markets with 5 campaigns but not for markets with 6, creating an inconsistent experience.
**Why it happens:** Arbitrary threshold with no data backing.
**How to avoid (Claude's discretion):** Use `campaignCount < 5` as the threshold. Markets with fewer than 5 campaigns have insufficient data for meaningful statistical comparison. Surface this from `selectedMarketInfo.campaignCount` (already in the MarketInfo shape).
**Warning signs:** Users see "limited data" warning for markets they consider healthy.

## Code Examples

Verified patterns from existing codebase:

### Drizzle conditional join (correct pattern)
```typescript
// Source: Drizzle ORM immutable builder — verified against packages/db patterns
const baseQuery = tx
  .select({ campaignId: incrementalityScores.campaignId, ... })
  .from(incrementalityScores)
  .innerJoin(campaigns, and(eq(incrementalityScores.campaignId, campaigns.id), eq(campaigns.tenantId, tenantId)));

const filteredQuery = marketId
  ? baseQuery.innerJoin(
      campaignMarkets,
      and(
        eq(campaignMarkets.campaignId, incrementalityScores.campaignId),
        eq(campaignMarkets.marketId, marketId),
      ),
    )
  : baseQuery;

return filteredQuery
  .where(and(eq(incrementalityScores.tenantId, tenantId), eq(incrementalityScores.scoreType, 'adjusted')))
  .orderBy(desc(incrementalityScores.scoredAt));
```

### TanStack Query select for client-side filter
```typescript
// Source: TanStack Query v5 docs — select option
// apps/web/lib/hooks/useRecommendations.ts
export function useRecommendations() {
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);

  return useQuery<Recommendation[], Error, Recommendation[]>({
    queryKey: ['recommendations'],   // stable — full set always cached here
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) throw new Error(`Failed to fetch recommendations: ${res.status}`);
      return res.json() as Promise<Recommendation[]>;
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      if (!selectedMarket) return data;
      return data.filter((r) => r.marketId === selectedMarket);
    },
  });
}
```

### Market badge on recommendation card
```typescript
// Flag emoji helper — reuse pattern from MarketSelector.tsx
function countryFlag(code: string): string {
  return code.toUpperCase().split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// In RecommendationCard header — after platform Badge:
{rec.marketName && (
  <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
    {rec.marketCountryCode ? countryFlag(rec.marketCountryCode) : ''} {rec.marketName}
  </Badge>
)}
```

### Stale market fallback (in page.tsx or useEffect)
```typescript
// After markets load — check if persisted selectedMarket is still valid
React.useEffect(() => {
  if (selectedMarket && markets.length > 0) {
    const exists = markets.some((m) => m.id === selectedMarket);
    if (!exists) {
      setSelectedMarket(null);
      toast('Selected market no longer exists — showing all markets.');
    }
  }
}, [markets, selectedMarket, setSelectedMarket]);
```

### Market summary in API response (route.ts)
```typescript
// Only extend response shape when marketId is provided (backwards compatible)
if (marketId) {
  const market = await withTenant(tenantId, async (tx) =>
    tx.select({ displayName: markets.displayName, campaignCount: markets.campaignCount })
      .from(markets)
      .where(and(eq(markets.id, marketId), eq(markets.tenantId, tenantId)))
      .limit(1)
  );
  const marketSummary = market[0]
    ? { marketName: market[0].displayName, campaignCount: market[0].campaignCount }
    : null;
  return NextResponse.json({ recommendations, marketSummary });
}
return NextResponse.json(recommendations);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate query key per filter | Stable key + `select` for derivation | TanStack Query v4+ | No network round-trip on filter change; instant UI |
| Drizzle mutating builder | Immutable builder (always assign) | Drizzle v0.28+ | Must reassign on each method call |

**Deprecated/outdated:**
- `onSuccess` callback in TanStack Query: `useMarkets` still uses `onSuccess` (line 27 in `hooks/useMarkets.ts`) — this was deprecated in TanStack Query v5. However, it's not this phase's concern to fix; note as tech debt.

## Open Questions

1. **Where to perform the stale-market validation (Pitfall 5)?**
   - What we know: `selectedMarket` persists to localStorage; markets list is loaded by `useMarkets` in `DashboardLayoutClient`
   - What's unclear: Whether the validation belongs in `useRecommendations`, the dashboard page `useEffect`, or the layout
   - Recommendation: Put it in the dashboard page's `useEffect` — it's a UX concern at the page level, not a data-fetching concern. The page already has access to both `markets` (from store) and `setSelectedMarket` (from store).

2. **Does the market summary need `dateRange` and `totalSpend` in the MVP?**
   - What we know: CONTEXT.md says "Response shape includes full market summary metadata when filtered: marketName, campaignCount, dateRange, totalSpend" — but no UI component currently consumes this
   - What's unclear: Is this needed for the filter label (which only uses campaign count) or for some future component
   - Recommendation: Implement `marketName` + `campaignCount` in the summary; defer `dateRange` and `totalSpend` to when a UI component needs them. The filter label only shows `marketName` and the campaign count of filtered recs.

3. **Should the `select` filter in `useRecommendations` also be applied to `useKpis` and `useCampaigns`?**
   - What we know: CONTEXT.md phase boundary is "recommendations only"; other views have separate market filtering already (presumably, from Phase 5/6 work)
   - What's unclear: Whether dashboard charts and KPIs are already market-aware
   - Recommendation: This phase scope is recommendations only per CONTEXT.md. Leave KPIs and chart market filtering as-is.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `apps/web/app/api/recommendations/route.ts` — confirms marketId is already extracted from params
- Direct codebase inspection: `apps/web/lib/recommendations/engine.ts` — confirms Drizzle chain bug at line 322
- Direct codebase inspection: `apps/web/lib/hooks/useRecommendations.ts` — confirms no market-awareness in hook
- Direct codebase inspection: `apps/web/lib/store/dashboard.ts` — confirms `selectedMarket` already persisted in Zustand
- Direct codebase inspection: `apps/web/components/layout/MarketSelector.tsx` — confirms single-market hide behavior already implemented
- Direct codebase inspection: `packages/db/src/schema/markets.ts` — confirms schema for markets + campaignMarkets tables
- Direct codebase inspection: `apps/web/lib/recommendations/types.ts` — confirms no `marketId`/`marketName` on Recommendation type

### Secondary (MEDIUM confidence)
- TanStack Query v5 `select` option — standard documented pattern for derived/filtered data from cached queries

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing; no new dependencies
- Architecture: HIGH — verified directly in codebase; bug is confirmed with line references
- Pitfalls: HIGH — Pitfalls 1-4 verified from code; Pitfall 5-6 are design-level, MEDIUM confidence on severity

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (30 days — stable Next.js/Drizzle/TanStack Query stack)
