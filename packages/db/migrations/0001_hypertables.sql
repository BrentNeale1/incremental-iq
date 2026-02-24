-- Custom SQL migration file, put your code below! --

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert campaign_metrics to hypertable
-- Partition by date with 1-month chunks (appropriate for MVP scale ~1-10K rows/day)
-- Tables must exist before hypertable conversion (depends on 0000_aberrant_namora.sql)
SELECT create_hypertable(
  'campaign_metrics',
  'date',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);

-- Compression: compress chunks older than 90 days
-- Segment by tenant and campaign for efficient range queries
-- Order by date DESC for time-range scan performance
ALTER TABLE campaign_metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id, campaign_id',
  timescaledb.compress_orderby = 'date DESC'
);
SELECT add_compression_policy('campaign_metrics', INTERVAL '90 days');

-- Convert raw_api_pulls to hypertable (append-only, benefits from time partitioning)
-- Use 1-week chunks (raw data has higher volume and shorter retention)
SELECT create_hypertable(
  'raw_api_pulls',
  'pulled_at',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE
);
