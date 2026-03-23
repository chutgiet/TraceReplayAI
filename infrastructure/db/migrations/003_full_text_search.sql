-- =============================================================================
-- Migration: 003_full_text_search
-- Description: Adds full-text search capability across event payloads.
--
-- Design notes:
--   - Uses PostgreSQL tsvector for efficient full-text search
--   - search_vector column combines: type, source_agent, source_framework,
--     tags, and recursively extracted text from JSONB payload
--   - GIN index on search_vector for fast ts_query lookups
--   - Trigger auto-populates search_vector on INSERT
--   - events table is append-only, so UPDATE trigger not needed
--   - jsonb_to_tsvector extracts all string/numeric values from payload
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper function: build a tsvector from an event row's searchable fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION events_build_search_vector(
  p_type         TEXT,
  p_source_agent TEXT,
  p_source_framework TEXT,
  p_tags         TEXT[],
  p_payload      JSONB
) RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT
    -- Weight A: event type and source agent (most important for filtering)
    setweight(to_tsvector('english', coalesce(p_type, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(p_source_agent, '')), 'A') ||
    -- Weight B: source framework and tags
    setweight(to_tsvector('english', coalesce(p_source_framework, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(p_tags, ' '), '')), 'B') ||
    -- Weight C: all string and numeric values extracted from payload JSONB
    setweight(
      jsonb_to_tsvector('english', coalesce(p_payload, '{}'::jsonb), '["string", "numeric"]'),
      'C'
    )
$$;

-- ---------------------------------------------------------------------------
-- Add search_vector column
-- ---------------------------------------------------------------------------

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ---------------------------------------------------------------------------
-- GIN index on search_vector for fast full-text queries
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_events_search_vector
  ON events USING GIN (search_vector);

-- ---------------------------------------------------------------------------
-- Trigger function: auto-populate search_vector on INSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION events_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := events_build_search_vector(
    NEW.type,
    NEW.source_agent,
    NEW.source_framework,
    NEW.tags,
    NEW.payload
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists (idempotent re-run)
DROP TRIGGER IF EXISTS trg_events_search_vector ON events;

CREATE TRIGGER trg_events_search_vector
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION events_search_vector_trigger();

-- ---------------------------------------------------------------------------
-- Backfill search_vector for existing rows
-- ---------------------------------------------------------------------------

UPDATE events
SET search_vector = events_build_search_vector(
  type, source_agent, source_framework, tags, payload
)
WHERE search_vector IS NULL;

-- ---------------------------------------------------------------------------
-- Composite index for search + tenant isolation
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_events_tenant_search
  ON events USING GIN (search_vector)
  WHERE tenant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Record this migration as applied
-- ---------------------------------------------------------------------------

INSERT INTO schema_migrations (version)
VALUES ('003_full_text_search')
ON CONFLICT (version) DO NOTHING;
