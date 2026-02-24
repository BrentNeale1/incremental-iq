/**
 * Scoring pipeline module for the ingestion package.
 *
 * Exports budget change detection utilities that run as part of the
 * post-sync scoring pipeline (after nightly data sync, before
 * scoring jobs are dispatched to the Python analysis engine).
 *
 * STAT-04: Budget change detection as trigger for pre/post ITS analysis.
 */

export {
  detectBudgetChanges,
  persistBudgetChange,
  scanAllCampaignsForBudgetChanges,
} from './budget-detection';

export type { BudgetChangeEvent } from './budget-detection';
