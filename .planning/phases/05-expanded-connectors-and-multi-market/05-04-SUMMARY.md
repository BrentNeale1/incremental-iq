---
phase: 05-expanded-connectors-and-multi-market
plan: 04
subsystem: frontend
tags: [market-selector, onboarding, zustand, api-routes, outcome-mode, ga4]

requires:
  - phase: 05-expanded-connectors-and-multi-market
    plan: 02
    provides: GA4 connector, OAuth routes, events/properties endpoints
  - phase: 05-expanded-connectors-and-multi-market
    plan: 03
    provides: Market API, market-partitioned scoring
provides:
  - Global MarketSelector in AppHeader with Zustand persistence
  - Market-filtered dashboard API routes (kpis, campaigns, incrementality, seasonality, saturation)
  - Onboarding components (MarketConfirmationStep, GA4EventSelector, OutcomeModeSelector)
  - useMarkets and useOutcomeMode hooks
  - Tenant preferences API (GET/PUT outcomeMode)
---

## What was built

### Task 1: Store, hooks, and market-filtered API routes

- Extended Zustand store with `selectedMarket`, `markets`, `outcomeMode` — selectedMarket persisted
- Created `useMarkets` TanStack Query hook (5min staleTime, syncs to store)
- Created `useOutcomeMode` hook with terminology mapping (Revenue/Leads)
- Created `/api/tenant/preferences` GET+PUT for outcomeMode
- Added optional `?marketId=` filter to 5 dashboard API routes via campaign_markets INNER JOIN

### Task 2: UI components

- **MarketSelector**: shadcn Select dropdown with country flag emojis, hidden for single-market tenants
- **AppHeader**: MarketSelector added between ViewToggle and ExportButton
- **MarketConfirmationStep**: Editable market list with campaign count badges, inline rename, confirm/delete/add
- **GA4EventSelector**: Key event checklist with select all toggle, saves selections via POST
- **OutcomeModeSelector**: Two-card revenue vs leads choice, saves to tenant preferences

### Task 3: Human verification checkpoint

Pending — visual verification of UI components needed.

## Key files

### Created
- `apps/web/components/layout/MarketSelector.tsx`
- `apps/web/components/onboarding/MarketConfirmationStep.tsx`
- `apps/web/components/onboarding/GA4EventSelector.tsx`
- `apps/web/components/onboarding/OutcomeModeSelector.tsx`
- `apps/web/hooks/useMarkets.ts`
- `apps/web/hooks/useOutcomeMode.ts`
- `apps/web/app/api/tenant/preferences/route.ts`

### Modified
- `apps/web/lib/store/dashboard.ts` — market + outcomeMode state
- `apps/web/components/layout/AppHeader.tsx` — MarketSelector integration
- `apps/web/app/api/dashboard/kpis/route.ts` — marketId filter
- `apps/web/app/api/dashboard/campaigns/route.ts` — marketId filter
- `apps/web/app/api/dashboard/incrementality/route.ts` — marketId filter
- `apps/web/app/api/dashboard/seasonality/route.ts` — marketId filter
- `apps/web/app/api/dashboard/saturation/route.ts` — marketId filter

## Duration

~10 min
