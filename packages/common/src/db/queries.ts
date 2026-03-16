import { type Pool, type PoolClient } from 'pg';
import { getPool } from './pool.js';
import type { EventRow, InsertEventRow, InsertRunRow, RunRow } from './types.js';

// ---------------------------------------------------------------------------
// runs
// ---------------------------------------------------------------------------

export async function insertRun(run: InsertRunRow, pool: Pool = getPool()): Promise<RunRow> {
  const result = await pool.query<RunRow>(
    `INSERT INTO runs (
       id, tenant_id, agent_id, run_name, trigger_source, parent_run_id,
       status, started_at, ended_at, tags, metadata, schema_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12
     )
     RETURNING *`,
    [
      run.id,
      run.tenant_id,
      run.agent_id,
      run.run_name ?? null,
      run.trigger_source ?? null,
      run.parent_run_id ?? null,
      run.status ?? 'running',
      run.started_at,
      run.ended_at ?? null,
      run.tags ?? [],
      run.metadata ? JSON.stringify(run.metadata) : null,
      run.schema_version,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error(`insertRun: no row returned for id=${run.id}`);
  return row;
}

export async function updateRunStatus(
  id: string,
  status: RunRow['status'],
  endedAt: Date | null,
  pool: Pool = getPool(),
): Promise<void> {
  await pool.query(
    `UPDATE runs
     SET status = $2, ended_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, status, endedAt],
  );
}

export async function getRunById(id: string, pool: Pool = getPool()): Promise<RunRow | null> {
  const result = await pool.query<RunRow>('SELECT * FROM runs WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export async function insertEvent(
  event: InsertEventRow,
  pool: Pool = getPool(),
): Promise<EventRow> {
  const result = await pool.query<EventRow>(
    `INSERT INTO events (
       id, run_id, tenant_id, type, sequence, parent_event_id,
       source_agent, source_framework, payload, raw_meta,
       tags, schema_version, "timestamp"
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13
     )
     RETURNING *`,
    [
      event.id,
      event.run_id,
      event.tenant_id,
      event.type,
      event.sequence ?? null,
      event.parent_event_id ?? null,
      event.source_agent,
      event.source_framework ?? null,
      JSON.stringify(event.payload),
      event.raw_meta ? JSON.stringify(event.raw_meta) : null,
      event.tags ?? [],
      event.schema_version,
      event.timestamp,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error(`insertEvent: no row returned for id=${event.id}`);
  return row;
}

export async function getEventsByRunId(
  runId: string,
  pool: Pool = getPool(),
): Promise<EventRow[]> {
  const result = await pool.query<EventRow>(
    `SELECT * FROM events
     WHERE run_id = $1
     ORDER BY sequence NULLS LAST, "timestamp"`,
    [runId],
  );
  return result.rows;
}

/**
 * Runs multiple operations in a single transaction.
 * The callback receives a PoolClient; commits on success, rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  pool: Pool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
