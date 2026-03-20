-- =============================================================================
-- Migration: 002_add_ingestion_order
-- Description: Adds an auto-incrementing ingestion_order column to the events
--              table so we can distinguish source order (timestamp + sequence)
--              from arrival order (ingestion_order).
--
-- Design notes:
--   - ingestion_order is a BIGSERIAL — monotonically increasing per-insert
--   - The replay engine sorts by timestamp + sequence (source order)
--   - ingestion_order is available for diagnostics and debugging when events
--     arrive out of order relative to their source timestamps
--   - The existing idx_events_run_id_seq index covers source ordering
--   - A new index covers ordering by ingestion_order within a run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Add ingestion_order column
-- ---------------------------------------------------------------------------

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ingestion_order BIGSERIAL;

-- Index for querying events in arrival order within a run
CREATE INDEX IF NOT EXISTS idx_events_run_id_ingestion_order
  ON events (run_id, ingestion_order);

COMMENT ON COLUMN events.ingestion_order IS
  'Monotonically increasing ingestion order. Tracks when the event was '
  'received by the ingest API, independent of the source timestamp.';

-- ---------------------------------------------------------------------------
-- Record this migration as applied
-- ---------------------------------------------------------------------------

INSERT INTO schema_migrations (version)
VALUES ('002_add_ingestion_order')
ON CONFLICT (version) DO NOTHING;
