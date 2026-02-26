# Deferred Items — Phase 09

## Pre-existing TypeScript Errors (out of scope for 09-01)

These errors existed before phase 09 began and are unrelated to the dashboard data wiring fixes.

### apps/web/app/(auth)/signup/actions.ts
- Lines 80, 84: `Property 'error' does not exist on type` — Better Auth signUpEmail return type mismatch

### apps/web/app/api/markets/route.ts
- Line 71: `createdAt: Date` not assignable to `string` in MarketRow type
- Line 92: `instanceof` expression type error

### apps/web/emails/DataHealthAlert.tsx, SeasonalDeadline.tsx
- Type `number` not assignable to `ReactNode & string` in email components

### packages/ingestion/src/scoring/
- Multiple `.rows` property errors on `RowList` type — postgres.js raw query result type mismatch
- Files: budget-detection.ts, dispatch.ts, rollup.ts, worker.ts
