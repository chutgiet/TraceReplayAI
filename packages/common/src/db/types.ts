/**
 * TypeScript row types that mirror the PostgreSQL schema defined in
 * infrastructure/db/migrations/001_initial_schema.sql.
 *
 * These are raw DB types (snake_case, pg-native representations).
 * Application-layer code should map these to domain types as needed.
 */

// ---------------------------------------------------------------------------
// schema_migrations
// ---------------------------------------------------------------------------

export interface SchemaMigrationRow {
  version: string;
  applied_at: Date;
}

// ---------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------

export type RunStatus = 'running' | 'success' | 'failure' | 'timeout' | 'cancelled';

export interface RunRow {
  id: string;
  tenant_id: string;
  agent_id: string;
  run_name: string | null;
  trigger_source: string | null;
  parent_run_id: string | null;
  status: RunStatus;
  started_at: Date;
  ended_at: Date | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  schema_version: string;
  created_at: Date;
  updated_at: Date;
}

// Subset for INSERT — omits DB-defaulted columns
export interface InsertRunRow {
  id: string;
  tenant_id: string;
  agent_id: string;
  run_name?: string | null;
  trigger_source?: string | null;
  parent_run_id?: string | null;
  status?: RunStatus;
  started_at: Date;
  ended_at?: Date | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  schema_version: string;
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export interface EventRow {
  id: string;
  run_id: string;
  tenant_id: string;
  type: string;
  sequence: number | null;
  parent_event_id: string | null;
  source_agent: string;
  source_framework: string | null;
  payload: Record<string, unknown>;
  raw_meta: Record<string, unknown> | null;
  tags: string[];
  schema_version: string;
  timestamp: Date;
  received_at: Date;
}

// Subset for INSERT — omits DB-defaulted columns
export interface InsertEventRow {
  id: string;
  run_id: string;
  tenant_id: string;
  type: string;
  sequence?: number | null;
  parent_event_id?: string | null;
  source_agent: string;
  source_framework?: string | null;
  payload: Record<string, unknown>;
  raw_meta?: Record<string, unknown> | null;
  tags?: string[];
  schema_version: string;
  timestamp: Date;
}
