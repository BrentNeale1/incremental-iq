# Phase 11: Backend Data Quality - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix four backend data correctness issues: duplicate row prevention in ingestion_coverage, Drizzle `and()` query bug in global status route, pooled raw score computation precision, and budget-change ITS intervention date accuracy. No new features — correctness fixes only.

</domain>

<decisions>
## Implementation Decisions

### Existing data cleanup
- Claude's discretion on whether to clean up existing duplicate rows or just prevent new ones
- Claude's discretion on duplicate prevention strategy (upsert vs unique constraint vs dedup)
- Claude's discretion on user-visible feedback — silent fix vs admin logging

### Global status query bug
- Researcher should investigate whether the `&&` bug has caused visible production issues
- Fix the Drizzle `and()` operator usage — straightforward code correction

### Scoring precision
- Scores are used for BOTH display and recommendation logic — accuracy matters
- Tolerate <1% drift between old approximation and direct computation
- If drift is <1%, forward-only fix is acceptable; if >1%, recalculate historical values
- Researcher should determine whether pooled raw scores are stored in DB or computed on-the-fly

### ITS intervention date
- Budget change dates are derived from cost data (not stored explicitly)
- Use the **midpoint of the budget transition period** as the ITS intervention point, not the first day of change
- Only **significant budget changes (>20%)** should trigger ITS analysis
- Claude's discretion on whether to reprocess existing ITS results that used wrong intervention dates

### Claude's Discretion
- Duplicate cleanup strategy and prevention mechanism
- Whether to backfill/recalculate historical data (guided by drift analysis)
- ITS reprocessing scope
- User-visible feedback approach (silent vs logged)
- Test coverage depth for each fix

</decisions>

<specifics>
## Specific Ideas

- Midpoint-of-transition for ITS intervention is a deliberate statistical choice — don't default to first-day-of-change
- The >20% budget change threshold should be configurable or at least easy to adjust later
- Since scores drive recommendations, even small systematic biases in the approximation method could compound

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-backend-data-quality*
*Context gathered: 2026-02-27*
