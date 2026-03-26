-- Evidence bundles table for audit-ready evidence assembly
-- Each row stores the assembled bundle as JSONB alongside status tracking

CREATE TABLE IF NOT EXISTS evidence_bundles (
  id                    UUID PRIMARY KEY,
  run_id                UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'assembling', 'complete', 'failed')),
  is_partial_run        BOOLEAN NOT NULL DEFAULT FALSE,
  error_message         TEXT,
  bundle_data           JSONB,
  bundle_schema_version TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ
);

-- Index for looking up bundles by run
CREATE INDEX IF NOT EXISTS idx_evidence_bundles_run_id
  ON evidence_bundles (run_id);

-- Index for listing bundles by tenant
CREATE INDEX IF NOT EXISTS idx_evidence_bundles_tenant_id
  ON evidence_bundles (tenant_id, created_at DESC);

-- Index for filtering by status (useful for finding pending/failed bundles)
CREATE INDEX IF NOT EXISTS idx_evidence_bundles_status
  ON evidence_bundles (status);
