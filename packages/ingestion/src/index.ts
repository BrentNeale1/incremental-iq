// Token encryption utilities for OAuth credential storage
export * from './crypto';

// Shared TypeScript types for connectors, normalizers, and job queue
export * from './types';

// PlatformConnector interface and raw data types
export * from './connector-base';

// BullMQ scheduler: queues, job registration, and enqueueing helpers
export {
  ingestionQueue,
  redisConnection,
  registerNightlySync,
  enqueueBackfill,
  enqueueManualSync,
} from './scheduler/queues';

// Scoring pipeline: dispatch, worker, persist, rollup, funnel-stage, budget-detection
export * from './scoring';

// Phase 5: Market detection from campaign geo targeting metadata
export * from './market-detection';

// Phase 5-02: GA4 connector for lead-gen outcome source
export { GA4Connector } from './connectors/ga4';
export type { GA4Property, GA4KeyEvent } from './connectors/ga4';
