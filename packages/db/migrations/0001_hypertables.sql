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

-- NOTE: Compression deferred — TimescaleDB compression is incompatible with RLS.
-- Production deployment should disable RLS on hypertables before enabling compression,
-- relying on application-layer tenant isolation (withTenant SET LOCAL) instead.

-- Convert raw_api_pulls to hypertable (append-only, benefits from time partitioning)
-- Use 1-week chunks (raw data has higher volume and shorter retention)
-- TimescaleDB requires partition column in all unique indexes/primary keys
ALTER TABLE raw_api_pulls DROP CONSTRAINT raw_api_pulls_pkey;
ALTER TABLE raw_api_pulls ADD PRIMARY KEY (id, pulled_at);
SELECT create_hypertable(
  'raw_api_pulls',
  'pulled_at',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE
);
