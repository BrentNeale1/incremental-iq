# Phase 9: Dashboard Data Wiring Fixes - Research

**Researched:** 2026-02-26
**Domain:** React/Next.js data wiring — type contract mismatches and orphaned hooks
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RPRT-01 | Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %) | Bug 1 fix ensures the platform comparison chart renders correct revenue values, completing the full dashboard KPI surface |
| RPRT-07 | Dual-audience views: simple summaries for business owners, detailed statistical output for analysts | Bug 2 fix wires `useOutcomeMode` so lead_gen tenants see "Leads" terminology instead of "Revenue" across all KPI views |
</phase_requirements>

---

## Summary

Phase 9 closes two integration gaps discovered during the v1 final audit. Both are pure data-wiring bugs — no schema changes, no new API endpoints, no new libraries needed. The fixes are confined to the client-side layer (`apps/web`).

**Bug 1 — Zero-revenue platform chart:** The `buildPlatformData` function in `apps/web/app/(dashboard)/page.tsx` reads `row.directRevenue` from each campaign row. However, the API route (`/api/dashboard/campaigns`) returns `{ revenue, ... }` — there is no `directRevenue` field in the JSON. The `useCampaigns` hook type definition (`lib/hooks/useCampaigns.ts`) independently defines a `CampaignRow` interface with `directRevenue` and `modeledRevenue`, but the API never sends those fields. Result: `row.directRevenue` is always `undefined`, which JavaScript coerces to `0`, making every bar in the chart render at zero height.

**Bug 2 — Orphaned useOutcomeMode hook:** The `useOutcomeMode` hook (`apps/web/hooks/useOutcomeMode.ts`) fetches the tenant's outcome mode from `/api/tenant/preferences` and returns display `terms` (`{ revenue: 'Leads', incrementalRevenue: 'Incremental Leads', conversion: 'Lead' }` for lead_gen tenants). This hook is never called anywhere in the dashboard. `DashboardLayoutClient` calls `useMarkets` (for the market selector) but never calls `useOutcomeMode`. As a result, the Zustand store's `outcomeMode` is never populated from the server, and `KpiCard`'s `METRIC_LABELS` dict is hardcoded — it always shows "Revenue" regardless of tenant type.

**Primary recommendation:** Fix Bug 1 by aligning `buildPlatformData` to use `row.revenue` (the field the API actually returns). Fix Bug 2 by calling `useOutcomeMode` in `DashboardLayoutClient` alongside `useMarkets`, then threading `terms` from the Zustand store into `KpiCard`'s label rendering.

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | (existing) | Global dashboard state including `outcomeMode` | Already manages `outcomeMode` in `DashboardState` — just needs to be populated |
| TanStack Query | (existing) | Data fetching hooks | `useMarkets` pattern is the exact model to follow for `useOutcomeMode` |
| React | (existing) | Component layer | `useTenantId()` hook available via `TenantProvider` — no new context needed |
| TypeScript | (existing) | Type safety | Type contract alignment is the core of Bug 1 fix |

### No new installations required

Both bugs are fixed by editing existing files only. No new packages.

---

## Architecture Patterns

### Pattern 1: API-to-Hook Type Contract Alignment

**What:** The API route defines the response shape internally. The consuming hook must mirror that shape exactly.

**The bug:** `useCampaigns.ts` defines a `CampaignRow` interface with `directRevenue` and `modeledRevenue`, but `/api/dashboard/campaigns` route returns `revenue` (the DB column aliased to `revenue` in the `CampaignRow` interface inside the route file). Two separate `CampaignRow` type definitions exist — one in the route, one in the hook — and they diverged.

**The fix:**
```typescript
// apps/web/lib/hooks/useCampaigns.ts — align to what the API actually returns
export interface CampaignRow {
  id: string;           // matches route's CampaignRow.id
  name: string;         // matches route's CampaignRow.name
  platform: string;     // matches route's CampaignRow.platform
  funnelStage: string | null;
  spend: number;
  revenue: number;      // CORRECT: API returns "revenue" not "directRevenue"
  roas: number;
  liftMean: number | null;
  liftLower: number | null;
  liftUpper: number | null;
  confidence: number | null;
  status: string | null;
  isRollup: boolean;
}
```

**The page-level fix:** Update `buildPlatformData` parameter type and body to read `row.revenue` instead of `row.directRevenue`. The `incrementalRevenue` field does not exist in the API response either — it must be derived or dropped from the platform chart aggregation.

```typescript
// apps/web/app/(dashboard)/page.tsx — fix buildPlatformData signature and body
function buildPlatformData(campaigns: {
  platform: string;
  spend: number;
  revenue: number;       // was: directRevenue (undefined in API response)
  liftMean: number | null; // available from API, can approximate incrementalRevenue
}[]): PlatformDataPoint[] {
  const byPlatform = new Map<string, PlatformDataPoint>();
  for (const row of campaigns) {
    const key = row.platform.charAt(0).toUpperCase() + row.platform.slice(1);
    const existing = byPlatform.get(key) ?? {
      platform: key,
      spend: 0,
      revenue: 0,
      incrementalRevenue: 0,
    };
    // Approximate incremental revenue: revenue * liftMean (or 0 if no score yet)
    const approxIncremental = row.revenue * (row.liftMean ?? 0);
    byPlatform.set(key, {
      platform: key,
      spend: existing.spend + row.spend,
      revenue: existing.revenue + row.revenue,  // was: row.directRevenue
      incrementalRevenue: existing.incrementalRevenue + approxIncremental,
    });
  }
  return Array.from(byPlatform.values());
}
```

**Note on `incrementalRevenue` for the platform chart:** The campaign-level API returns `liftMean` (the incrementality lift fraction). `revenue * liftMean` is a reasonable proxy for incremental revenue per campaign — matching how the KPIs route computes it. If `liftMean` is null (no score yet), the bar renders at 0 which is correct (not enough data).

### Pattern 2: useOutcomeMode Wiring — Follow the useMarkets Pattern

**What:** `useOutcomeMode` is an orphaned hook. It must be called at layout level so all dashboard pages inherit the populated `outcomeMode` from the Zustand store.

**Existing pattern to follow** (`DashboardLayoutClient.tsx`):
```typescript
// Already in DashboardLayoutClient — model for useOutcomeMode
useMarkets(tenantId);  // fetches, syncs to Zustand store
```

`useMarkets` fetches from the API, syncs data into Zustand via `setMarkets`, and child components read from `useDashboardStore((s) => s.markets)`. `useOutcomeMode` must follow the exact same pattern: called in `DashboardLayoutClient`, syncs `outcomeMode` into Zustand via `setOutcomeMode`.

**Fix in DashboardLayoutClient:**
```typescript
// apps/web/components/layout/DashboardLayoutClient.tsx
import { useOutcomeMode } from '@/hooks/useOutcomeMode';

export function DashboardLayoutClient({ tenantId, user, children }) {
  React.useEffect(() => {
    useDashboardStore.persist.rehydrate();
  }, []);

  useMarkets(tenantId);
  useOutcomeMode(tenantId);  // ADD: fetches preferences, sets outcomeMode in store

  return (/* ... */);
}
```

**Note:** `useOutcomeMode` already uses `useDashboardStore((s) => s.setOutcomeMode)` internally — no Zustand store changes needed. The hook signature already accepts `tenantId: string | undefined`, matching `DashboardLayoutClient`'s prop type.

### Pattern 3: Propagating outcomeMode to KpiCard Labels

**What:** Once `useOutcomeMode` populates the store, `KpiCard` must read dynamic labels instead of hardcoded strings.

**Current state:** `KpiCard.tsx` has a hardcoded `METRIC_LABELS` dict — `revenue: 'Revenue'` and `incremental_revenue: 'Incremental Revenue'`. These never change regardless of tenant type.

**The fix — two options:**

**Option A (simpler):** Read `outcomeMode` from Zustand inside `KpiCard` and compute the label dynamically.
```typescript
// apps/web/components/dashboard/KpiCard.tsx
import { useDashboardStore } from '@/lib/store/dashboard';

export function KpiCard({ metricKey, value, delta, deltaPct, isDragging, className }) {
  const outcomeMode = useDashboardStore((s) => s.outcomeMode);

  const METRIC_LABELS: Record<KpiMetricKey, string> = {
    spend: 'Total Spend',
    revenue: outcomeMode === 'lead_gen' ? 'Leads' : 'Revenue',
    roas: outcomeMode === 'lead_gen' ? 'Cost per Lead' : 'ROAS',
    incremental_revenue: outcomeMode === 'lead_gen' ? 'Incremental Leads' : 'Incremental Revenue',
    lift_pct: 'Avg Lift %',
    avg_confidence: 'Avg Confidence',
  };

  const label = METRIC_LABELS[metricKey];
  // rest unchanged
}
```

**Option B (uses useOutcomeMode terms):** Pass `terms` down from the page. More props, but more explicit.

**Recommendation: Option A.** Reading from Zustand inside `KpiCard` is consistent with how `KpiGrid` already reads `kpiOrder` from Zustand directly. No prop drilling.

**Also consider:** `PlatformComparisonChart` uses `chartConfig` with hardcoded `label: 'Revenue'`. This label appears in the chart legend and tooltip. It should also use `outcomeMode` to show "Leads" for lead_gen tenants. Same pattern as Option A applies.

### Recommended Scope of Changes

| File | Change |
|------|--------|
| `apps/web/lib/hooks/useCampaigns.ts` | Align `CampaignRow` interface to API response fields (`revenue` not `directRevenue`) |
| `apps/web/app/(dashboard)/page.tsx` | Fix `buildPlatformData` to read `row.revenue`; update parameter type; fix `incrementalRevenue` derivation |
| `apps/web/components/layout/DashboardLayoutClient.tsx` | Add `useOutcomeMode(tenantId)` call alongside `useMarkets(tenantId)` |
| `apps/web/components/dashboard/KpiCard.tsx` | Make `METRIC_LABELS` dynamic based on `outcomeMode` from Zustand store |
| `apps/web/components/charts/PlatformComparisonChart.tsx` | (Optional/low-impact) Make `chartConfig` labels dynamic for chart legend/tooltip |

### Anti-Patterns to Avoid

- **Prop-drilling `terms` from layout to every card:** The Zustand store already holds `outcomeMode`. Read it locally in components that need dynamic labels — same pattern as `kpiOrder` in `KpiGrid`.
- **Adding `incrementalRevenue` to the campaigns API response:** That would require DB changes and is scope creep. Derive it from `liftMean * revenue` on the client — same approximation the KPIs route uses server-side.
- **Creating a new `/api/dashboard/platform-summary` endpoint:** Unnecessary. The campaigns response already has everything needed; the bug is a field name mismatch, not a missing field.
- **Changing the campaigns API `revenue` field name:** The field name `revenue` in the API response is correct. The hook's stale `directRevenue` interface is what diverged from reality.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessing tenantId in client components | Custom auth context | `useTenantId()` from `@/lib/auth/tenant-context` | Already wired by `TenantProvider` in layout |
| Global outcome mode state | Local component state | Zustand `useDashboardStore((s) => s.outcomeMode)` | Store already has `outcomeMode` field and setter |
| Fetching tenant preferences | New fetch logic | `useOutcomeMode(tenantId)` — hook already exists | Hook already handles fetch, error handling, and store sync |

**Key insight:** Both bugs are wiring gaps where the plumbing already exists but the connections were not made. No new infrastructure is needed.

---

## Common Pitfalls

### Pitfall 1: Two CampaignRow Type Definitions in the Same Codebase
**What goes wrong:** The API route file (`/api/dashboard/campaigns/route.ts`) has its own internal `CampaignRow` interface (lines 36-50). The hook file (`lib/hooks/useCampaigns.ts`) has a separate `CampaignRow` interface (lines 7-17). These two diverged. TypeScript does not catch this because they live in different files with no import relationship.

**Why it happens:** The API route defines what it returns; the hook defines what it expects to receive. Without a shared type package between route and client, they can drift.

**How to avoid:** Update the hook's interface to exactly match the API route's response shape. Confirm field names against the actual JSON keys in the route's response-building code (lines 280-294 of route.ts), not against the internal DB column names.

**Warning signs:** Chart bars rendering at zero even when data is present. TypeScript will not warn because `undefined` is assignable to `number | undefined` in loose contexts, and JavaScript coerces `undefined` arithmetic to `NaN` or `0`.

### Pitfall 2: useOutcomeMode signature requires tenantId (not undefined-safe by default)
**What goes wrong:** `useOutcomeMode` accepts `tenantId: string | undefined`. When called in `DashboardLayoutClient`, `tenantId` is always a `string` (validated by the server layout). However, the internal `useEffect` guards on `if (!tenantId) return` — this is already handled. No risk here as long as the call site passes `tenantId` correctly.

**Warning signs:** If `tenantId` were ever `undefined` at the call site, the hook silently skips the fetch and `outcomeMode` stays as the default `'ecommerce'`. This would mask the bug. Confirm `DashboardLayoutClient` always receives a defined string.

### Pitfall 3: ROAS label for lead_gen tenants
**What goes wrong:** For lead_gen tenants, the ROAS metric is conceptually "Cost per Lead" — not a ratio label. If only `revenue` and `incremental_revenue` labels are updated, ROAS still says "ROAS" which is confusing for lead_gen users.

**How to avoid:** When updating `METRIC_LABELS`, also update the `roas` label: `outcomeMode === 'lead_gen' ? 'Cost per Lead' : 'ROAS'`. Note: `formatKpiValue` for `roas` appends "x" (e.g., "2.30x") which is also wrong for lead_gen cost-per-lead display. Consider whether the format function also needs a branch, or accept "2.30x" as a v1 approximation.

### Pitfall 4: PlatformComparisonChart chartConfig is module-level constant
**What goes wrong:** `chartConfig` in `PlatformComparisonChart.tsx` is declared at module scope (outside the component function). This means it cannot read from Zustand hooks. To make chart labels dynamic, `chartConfig` must be moved inside the component function body.

**How to avoid:** Move `chartConfig` declaration inside `PlatformComparisonChart` function. Accept `outcomeMode` as a prop, or read it from Zustand inside the component. For v1, accepting it as prop from `page.tsx` (which already reads Zustand) avoids adding a Zustand dependency to the chart component.

### Pitfall 5: incrementalRevenue derivation may differ from KPIs endpoint
**What goes wrong:** The KPIs endpoint uses `modeledRevenue - directRevenue` to compute incremental revenue (a server-side DB aggregation). The proposed `liftMean * revenue` derivation in `buildPlatformData` is an approximation — the chart's "Incremental Revenue" bars will not exactly match the KPI card's "Incremental Revenue" value.

**How to avoid:** This is acceptable for v1 because: (1) `liftMean` is a proportional lift score designed to be multiplied against revenue; (2) the chart is a relative comparison across platforms, not an absolute dollar figure. Document this as a known approximation in a code comment.

---

## Code Examples

### Bug 1 Fix — Corrected buildPlatformData

```typescript
// Source: apps/web/app/(dashboard)/page.tsx — corrected version
// The API returns { id, name, platform, funnelStage, spend, revenue, roas,
// liftMean, liftLower, liftUpper, confidence, status, isRollup }
// There is NO directRevenue or modeledRevenue field in the API response.

function buildPlatformData(campaigns: {
  platform: string;
  spend: number;
  revenue: number;        // was "directRevenue" — that field does not exist in API response
  liftMean: number | null;
}[]): PlatformDataPoint[] {
  const byPlatform = new Map<string, PlatformDataPoint>();

  for (const row of campaigns) {
    const key = row.platform.charAt(0).toUpperCase() + row.platform.slice(1);
    const existing = byPlatform.get(key) ?? {
      platform: key,
      spend: 0,
      revenue: 0,
      incrementalRevenue: 0,
    };
    // Approximate: incremental revenue = revenue × lift fraction
    // liftMean is a fractional lift score (e.g. 0.35 = 35% lift)
    const approxIncremental = row.revenue * (row.liftMean ?? 0);
    byPlatform.set(key, {
      platform: key,
      spend: existing.spend + row.spend,
      revenue: existing.revenue + row.revenue,   // fixed: was row.directRevenue
      incrementalRevenue: existing.incrementalRevenue + approxIncremental,
    });
  }

  return Array.from(byPlatform.values());
}
```

### Bug 1 Fix — Corrected CampaignRow in useCampaigns.ts

```typescript
// Source: apps/web/lib/hooks/useCampaigns.ts — aligned to API response
// API route returns these exact fields (see route.ts lines 280-294)
export interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  funnelStage: string | null;
  spend: number;
  revenue: number;        // API field name — not "directRevenue"
  roas: number;
  liftMean: number | null;
  liftLower: number | null;
  liftUpper: number | null;
  confidence: number | null;
  status: string | null;
  isRollup: boolean;
}
```

### Bug 2 Fix — Wire useOutcomeMode in DashboardLayoutClient

```typescript
// Source: apps/web/components/layout/DashboardLayoutClient.tsx — add hook call
import { useOutcomeMode } from '@/hooks/useOutcomeMode';

export function DashboardLayoutClient({ tenantId, user, children }) {
  React.useEffect(() => {
    useDashboardStore.persist.rehydrate();
  }, []);

  useMarkets(tenantId);       // already present — populates markets in store
  useOutcomeMode(tenantId);   // ADD: fetches /api/tenant/preferences, sets outcomeMode in store

  return (
    <TenantProvider tenantId={tenantId}>
      {/* ... rest of JSX unchanged ... */}
    </TenantProvider>
  );
}
```

### Bug 2 Fix — Dynamic labels in KpiCard

```typescript
// Source: apps/web/components/dashboard/KpiCard.tsx — dynamic label map
import { useDashboardStore } from '@/lib/store/dashboard';

export function KpiCard({ metricKey, value, delta, deltaPct, isDragging, className }) {
  const outcomeMode = useDashboardStore((s) => s.outcomeMode);

  // Labels change based on tenant type — lead_gen sees "Leads" terminology
  const METRIC_LABELS: Record<KpiMetricKey, string> = {
    spend: 'Total Spend',
    revenue: outcomeMode === 'lead_gen' ? 'Leads' : 'Revenue',
    roas: outcomeMode === 'lead_gen' ? 'Cost per Lead' : 'ROAS',
    incremental_revenue: outcomeMode === 'lead_gen' ? 'Incremental Leads' : 'Incremental Revenue',
    lift_pct: 'Avg Lift %',
    avg_confidence: 'Avg Confidence',
  };

  const label = METRIC_LABELS[metricKey];
  const formattedValue = formatKpiValue(metricKey, value);
  // ... rest unchanged
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hook type defines API response shape independently | Hook type mirrors API route's internal response type exactly | Prevents field name drift |
| Orphaned hooks exist in codebase unused | Hooks called at layout level, syncing state globally | All pages inherit populated state |

**Key insight about this project's pattern:** `useMarkets` (called in `DashboardLayoutClient`) is the established pattern for "fetch at layout level, sync to Zustand store, all children read from store." `useOutcomeMode` was designed to follow this same pattern but the call site was never added.

---

## Open Questions

1. **Does `formatKpiValue` for `roas` need to change for lead_gen?**
   - What we know: For lead_gen, "ROAS" conceptually becomes "Cost per Lead" (an inverse metric). `formatKpiValue('roas', 2.5)` returns `"2.50x"` — which is misleading for cost-per-lead.
   - What's unclear: Whether RPRT-07 scope includes format changes or only label changes.
   - Recommendation: For v1, update only the label string. Leave format as-is. Add a code comment noting this as a known v2 enhancement. The audit only flagged terminology, not formatting.

2. **Should PlatformComparisonChart legend/tooltip labels also update for lead_gen?**
   - What we know: `chartConfig` has `revenue: { label: 'Revenue' }` and `incrementalRevenue: { label: 'Incremental Revenue' }`. These appear in the Recharts legend and tooltip.
   - What's unclear: Whether the audit flagged chart labels specifically or only KPI card labels.
   - Recommendation: Update chart labels too for consistency — a lead_gen tenant seeing "Revenue" in the chart legend while KPI cards say "Leads" would be confusing. Fix both in the same plan.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `apps/web/app/(dashboard)/page.tsx` (buildPlatformData function, lines 49-74)
- Direct codebase inspection — `apps/web/app/api/dashboard/campaigns/route.ts` (CampaignRow interface, lines 36-50; response builder, lines 274-294)
- Direct codebase inspection — `apps/web/lib/hooks/useCampaigns.ts` (CampaignRow interface, lines 7-17)
- Direct codebase inspection — `apps/web/hooks/useOutcomeMode.ts` (hook definition and TERMS map)
- Direct codebase inspection — `apps/web/components/layout/DashboardLayoutClient.tsx` (useMarkets call, no useOutcomeMode call)
- Direct codebase inspection — `apps/web/components/dashboard/KpiCard.tsx` (hardcoded METRIC_LABELS)
- Direct codebase inspection — `apps/web/lib/store/dashboard.ts` (outcomeMode in DashboardState)
- `grep` search — confirmed `useOutcomeMode` is only defined in `hooks/useOutcomeMode.ts`, never imported anywhere in the dashboard
- `grep` search — confirmed `directRevenue` appears in `page.tsx` and `useCampaigns.ts` but NOT in the API route response

### Secondary (MEDIUM confidence)
- None needed — both bugs are fully characterized by static code inspection

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — both bugs confirmed by reading actual source files; no ambiguity
- Fix approach: HIGH — both fixes follow established patterns already in the codebase (`useMarkets` pattern, Zustand local reads)
- Scope of impact: HIGH — changes are narrowly confined to 4-5 files; no schema, API, or infrastructure changes

**Research date:** 2026-02-26
**Valid until:** 2026-03-28 (stable codebase — these file paths are unlikely to move)
