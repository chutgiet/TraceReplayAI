-- =============================================================================
-- Migration: 001_initial_schema
-- Description: Creates the foundational runs and events tables.
--
-- Design notes:
--   - events is APPEND-ONLY: never UPDATE or DELETE rows
--   - runs is a mutable aggregate derived from run lifecycle events
--   - tenant_id is denormalised on both tables for efficient per-tenant queries
--   - payload stored as JSONB for flexible querying + GIN index
--   - schema_migrations table tracks applied migrations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema migration tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- runs: mutable aggregate representing one AI agent execution
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS runs (
  -- Identity
  id              UUID        PRIMARY KEY,
  tenant_id       TEXT        NOT NULL,

  -- Run metadata (populated from run.start payload)
  agent_id        TEXT        NOT NULL,
  run_name        TEXT,
  trigger_source  TEXT,
  parent_run_id   UUID        REFERENCES runs(id),

  -- Lifecycle
  status          TEXT        NOT NULL DEFAULT 'running',
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,

  -- Extras
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  metadata        JSONB,
  schema_version  TEXT        NOT NULL,

  -- Housekeeping
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT runs_status_check
    CHECK (status IN ('running', 'success', 'failure', 'timeout', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_runs_tenant_id    ON runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status       ON runs (status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at   ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_parent_run_id
  ON runs (parent_run_id)
  WHERE parent_run_id IS NOT NULL;

COMMENT ON TABLE runs IS
  'Mutable aggregate representing one AI agent execution lifecycle. '
  'Updated when run.end or run.error events are processed.';

-- ---------------------------------------------------------------------------
-- events: append-only canonical event store
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  -- Identity
  id               UUID        PRIMARY KEY,
  run_id           UUID        NOT NULL REFERENCES runs(id),
  tenant_id        TEXT        NOT NULL,

  -- Event descriptor
  type             TEXT        NOT NULL,
  sequence         INTEGER,                         -- source-assigned, may have gaps
  parent_event_id  UUID        REFERENCES events(id),

  -- Source attribution
  source_agent     TEXT        NOT NULL,
  source_framework TEXT,

  -- Payload
  payload          JSONB       NOT NULL DEFAULT '{}',
  raw_meta         JSONB,                           -- original vendor telemetry preserved

  -- Extras
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  schema_version   TEXT        NOT NULL,

  -- Timestamps
  "timestamp"      TIMESTAMPTZ NOT NULL,            -- when the event occurred at source
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() -- when we received it
);

-- Query-pattern indexes
CREATE INDEX IF NOT EXISTS idx_events_run_id
  ON events (run_id);

CREATE INDEX IF NOT EXISTS idx_events_tenant_id
  ON events (tenant_id);

CREATE INDEX IF NOT EXISTS idx_events_type
  ON events (type);

CREATE INDEX IF NOT EXISTS idx_events_timestamp
  ON events ("timestamp" DESC);

-- For timeline reconstruction: order events within a run by sequence then time
CREATE INDEX IF NOT EXISTS idx_events_run_id_seq
  ON events (run_id, sequence NULLS LAST, "timestamp");

-- For causal lineage traversal
CREATE INDEX IF NOT EXISTS idx_events_parent_event_id
  ON events (parent_event_id)
  WHERE parent_event_id IS NOT NULL;

-- GIN index on payload for ad-hoc JSONB querying
CREATE INDEX IF NOT EXISTS idx_events_payload_gin
  ON events USING GIN (payload);

COMMENT ON TABLE events IS
  'Append-only canonical event store. NEVER UPDATE or DELETE rows. '
  'All agent telemetry is normalised to this schema before persistence.';

COMMENT ON COLUMN events.payload IS
  'Event-type-specific data. Schema varies by type field; see event-schema package.';

COMMENT ON COLUMN events.raw_meta IS
  'Original vendor telemetry payload preserved for forensic inspection.';

COMMENT ON COLUMN events."timestamp" IS
  'ISO 8601 UTC timestamp when the event occurred at the source agent.';

-- ---------------------------------------------------------------------------
-- Record this migration as applied
-- ---------------------------------------------------------------------------

INSERT INTO schema_migrations (version)
VALUES ('001_initial_schema')
ON CONFLICT (version) DO NOTHING;
