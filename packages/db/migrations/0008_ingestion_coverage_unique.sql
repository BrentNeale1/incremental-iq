-- Phase 11: Add unique constraint to ingestion_coverage to prevent duplicate rows on re-sync.
-- Must dedup existing rows BEFORE adding the unique index (Pitfall 2 from RESEARCH.md).

DELETE FROM ingestion_coverage
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, source, coverage_date) id
  FROM ingestion_coverage
  ORDER BY tenant_id, source, coverage_date, ingested_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_coverage_tenant_source_date_idx
  ON ingestion_coverage (tenant_id, source, coverage_date);
