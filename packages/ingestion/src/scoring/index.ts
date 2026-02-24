/**
 * Scoring pipeline module for the ingestion package.
 *
 * Exports the complete scoring orchestration layer:
 *   - Budget change detection (STAT-04)
 *   - Scoring job dispatch via BullMQ (separate 'scoring' queue)
 *   - Campaign scoring worker (calls Python sidecar, persists results)
 *   - Score persistence (dual adjusted/raw rows + saturation + ARCH-02 update)
 *   - Spend-weighted rollup with uncertainty propagation (STAT-02)
 *   - Funnel stage auto-assignment (Platform x Funnel Stage clustering)
 */

// Budget change detection (Plan 05)
export {
  detectBudgetChanges,
  persistBudgetChange,
  scanAllCampaignsForBudgetChanges,
} from './budget-detection';

export type { BudgetChangeEvent } from './budget-detection';

// Scoring dispatch — BullMQ job enqueueing
export {
  scoringQueue,
  enqueueScoringJob,
  enqueueFullTenantScoring,
  registerWeeklyRefit,
} from './dispatch';

export type { ScoringJobData, TenantScoringJobData } from './dispatch';

// Scoring worker — Python sidecar integration
export { processScoringJob } from './worker';

// Score persistence — write results to DB tables
export { persistScores } from './persist';

export type {
  ScoringResults,
  IncrementalityResult,
  SaturationResult,
  AnomalyResult,
} from './persist';

// Funnel stage auto-assignment
export { assignFunnelStage, mapObjectiveToFunnelStage } from './funnel-stage';

export type { FunnelStage } from './funnel-stage';

// Spend-weighted rollup with uncertainty propagation (STAT-02)
export {
  spendWeightedRollup,
  computeHierarchyRollups,
  recomputeRollups,
} from './rollup';

export type { CampaignScore, RollupScore } from './rollup';
