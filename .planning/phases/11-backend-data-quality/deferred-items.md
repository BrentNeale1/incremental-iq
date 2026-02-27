# Deferred Items - Phase 11

## Pre-existing TypeScript errors in apps/web (out of scope for 11-01)

Found during 11-01 Task 2 TypeScript verification. These errors existed before Phase 11 changes:

- `app/(auth)/signup/actions.ts` lines 80, 84: Property 'error' does not exist on Better Auth response type
- `app/api/markets/route.ts` lines 71, 92: MarketRow type mismatch (createdAt Date vs string), instanceof error
- `emails/DataHealthAlert.tsx` line 38: Type 'number' not assignable to 'ReactNode & string'
- `emails/SeasonalDeadline.tsx` line 48: Type 'number' not assignable to 'ReactNode & string'
- `packages/ingestion/src/scoring/budget-detection.ts` lines 130, 134, 214: Property 'rows' on RowList
- `packages/ingestion/src/scoring/dispatch.ts` line 110: Property 'rows' on RowList
- `packages/ingestion/src/scoring/rollup.ts` lines 294, 299, 329, 357: Property 'rows' on RowList
- `packages/ingestion/src/scoring/worker.ts` line 157: Property 'budgetChangeDate' on ScoringJobData

None of these are in files modified by 11-01. The integrations/status/route.ts file compiles with no errors.

## Pre-existing TypeScript errors in packages/ingestion (out of scope for 11-02)

Found during 11-02 Task 2 TypeScript verification. These errors existed before Phase 11 changes:

- `packages/ingestion/src/scheduler/workers.ts` line 5: `enqueueFullTenantScoring` not exported from `../scoring/worker` (it's exported from `./scoring/dispatch` via the index.ts barrel, but workers.ts imports it directly from worker.ts)
- `packages/ingestion/src/scoring/budget-detection.ts` lines 148, 152, 232: Property 'rows' on RowList (pre-existing)
- `packages/ingestion/src/scoring/dispatch.ts` line 115: Property 'rows' on RowList (pre-existing)
- `packages/ingestion/src/scoring/rollup.ts` lines 294, 299, 329, 357: Property 'rows' on RowList (pre-existing)
- `packages/ingestion/src/scoring/worker.ts` multiple lines: Property 'rows' on RowList (pre-existing)

The `budgetChangeDate` TS2339 error that was present in the 11-02 baseline is now resolved by adding the field to ScoringJobData in dispatch.ts.
