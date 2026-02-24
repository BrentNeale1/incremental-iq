# Deferred Items - Phase 02

## From Plan 03 execution (2026-02-24)

### Pre-existing TypeScript errors in shopify.ts (out of scope for Plan 03)

These errors exist in `packages/ingestion/src/connectors/shopify.ts` which is a stub
from a prior plan. They are not caused by Plan 03 changes and are Plan 05's responsibility.

**Files with pre-existing errors:**
- `packages/ingestion/src/connectors/shopify.ts` - 12 TypeScript errors
  - `Type 'typeof GraphqlClient' does not satisfy constraint '(...args: any) => any'` (x3)
  - Implicit `any` types from circular initializers (x6)
  - `Property 'body' does not exist on GraphQLClientResponse` (x2)
  - Other type errors

**When to fix:** Plan 05 (Shopify connector implementation)
