import { type Pool, type PoolClient } from 'pg';
import { getPool } from './pool.js';
import type { EventRow, InsertEventRow, InsertRunRow, RunListRow, RunRow, SearchEventRow } from './types.js';

// ---------------------------------------------------------------------------
// Shared filter / pagination types
// ---------------------------------------------------------------------------

export interface ListRunsFilter {
  tenantId?: string;
  status?: RunRow['status'];
  agentId?: string;
  startedAfter?: Date;
  startedBefore?: Date;
}

export interface CursorPage {
  cursor?: string;   // opaque cursor — currently the run's started_at ISO string
  limit?: number;    // default 20, max 100
}

export interface ListRunsResult {
  runs: RunListRow[];
  nextCursor: string | null;
}

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

export async function listRuns(
  filter: ListRunsFilter = {},
  page: CursorPage = {},
  pool: Pool = getPool(),
): Promise<ListRunsResult> {
  const limit = Math.min(Math.max(page.limit ?? 20, 1), 100);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filter.tenantId) {
    conditions.push(`tenant_id = $${paramIdx++}`);
    params.push(filter.tenantId);
  }
  if (filter.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filter.status);
  }
  if (filter.agentId) {
    conditions.push(`agent_id = $${paramIdx++}`);
    params.push(filter.agentId);
  }
  if (filter.startedAfter) {
    conditions.push(`started_at >= $${paramIdx++}`);
    params.push(filter.startedAfter);
  }
  if (filter.startedBefore) {
    conditions.push(`started_at <= $${paramIdx++}`);
    params.push(filter.startedBefore);
  }
  if (page.cursor) {
    conditions.push(`started_at < $${paramIdx++}`);
    params.push(new Date(page.cursor));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Fetch one extra row to determine if there's a next page
  params.push(limit + 1);

  const sql = `SELECT r.*, (SELECT COUNT(*) FROM events e WHERE e.run_id = r.id) AS event_count FROM runs r ${where} ORDER BY r.started_at DESC LIMIT $${paramIdx}`;

  const result = await pool.query<RunListRow>(sql, params);

  const hasMore = result.rows.length > limit;
  const runs = hasMore ? result.rows.slice(0, limit) : result.rows;
  const lastRun = runs[runs.length - 1];
  const nextCursor = hasMore && lastRun ? lastRun.started_at.toISOString() : null;

  return { runs, nextCursor };
}

// ---------------------------------------------------------------------------
// Child / ancestry run queries
// ---------------------------------------------------------------------------

/** Fetch all runs whose parent_run_id matches the given ID. */
export async function getChildRunsByParentId(
  parentRunId: string,
  pool: Pool = getPool(),
): Promise<RunRow[]> {
  const result = await pool.query<RunRow>(
    `SELECT * FROM runs WHERE parent_run_id = $1 ORDER BY started_at ASC`,
    [parentRunId],
  );
  return result.rows;
}

/**
 * Walk up the parent_run_id chain from a given run, returning ancestor runs
 * from immediate parent → root. Returns empty array if the run has no parent.
 * Guards against infinite loops with a max depth of 20.
 */
export async function getAncestryChain(
  runId: string,
  pool: Pool = getPool(),
): Promise<RunRow[]> {
  const result = await pool.query<RunRow>(
    `WITH RECURSIVE ancestors AS (
       SELECT r.* FROM runs r WHERE r.id = (SELECT parent_run_id FROM runs WHERE id = $1)
       UNION ALL
       SELECT r.* FROM runs r INNER JOIN ancestors a ON r.id = a.parent_run_id
     )
     SELECT * FROM ancestors LIMIT 20`,
    [runId],
  );
  return result.rows;
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

export async function getEventById(
  id: string,
  pool: Pool = getPool(),
): Promise<EventRow | null> {
  const result = await pool.query<EventRow>('SELECT * FROM events WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getEventsByRunId(
  runId: string,
  pool: Pool = getPool(),
): Promise<EventRow[]> {
  const result = await pool.query<EventRow>(
    `SELECT * FROM events
     WHERE run_id = $1
     ORDER BY "timestamp", sequence NULLS LAST, ingestion_order`,
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

// ---------------------------------------------------------------------------
// Full-text search
// ---------------------------------------------------------------------------

export interface SearchEventsFilter {
  /** The search query string (required). Converted to tsquery internally. */
  query: string;
  /** Filter to a specific tenant. */
  tenantId?: string;
  /** Filter to a specific run. */
  runId?: string;
  /** Filter by event type(s). */
  eventTypes?: string[];
  /** Only events after this timestamp. */
  after?: Date;
  /** Only events before this timestamp. */
  before?: Date;
}

export interface SearchEventsPage {
  /** Opaque cursor for pagination — currently a composite rank:id string. */
  cursor?: string;
  /** Page size (default 20, max 100). */
  limit?: number;
}

export interface SearchEventsResult {
  events: SearchEventRow[];
  nextCursor: string | null;
  totalEstimate: number;
}

/**
 * Full-text search across event payloads using PostgreSQL tsvector.
 *
 * The search_vector column is maintained by a trigger and combines:
 * type (weight A), source_agent (weight A), source_framework (weight B),
 * tags (weight B), and all string/numeric payload values (weight C).
 *
 * Returns events ranked by relevance with highlighted headline snippets.
 */
export async function searchEvents(
  filter: SearchEventsFilter,
  page: SearchEventsPage = {},
  pool: Pool = getPool(),
): Promise<SearchEventsResult> {
  const limit = Math.min(Math.max(page.limit ?? 20, 1), 100);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  // Full-text query — use websearch_to_tsquery for user-friendly input
  // (supports "quoted phrases", OR, -, etc.)
  conditions.push(`search_vector @@ websearch_to_tsquery('english', $${paramIdx})`);
  const queryParamIdx = paramIdx;
  params.push(filter.query);
  paramIdx++;

  if (filter.tenantId) {
    conditions.push(`tenant_id = $${paramIdx++}`);
    params.push(filter.tenantId);
  }
  if (filter.runId) {
    conditions.push(`run_id = $${paramIdx++}`);
    params.push(filter.runId);
  }
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    conditions.push(`type = ANY($${paramIdx++})`);
    params.push(filter.eventTypes);
  }
  if (filter.after) {
    conditions.push(`"timestamp" >= $${paramIdx++}`);
    params.push(filter.after);
  }
  if (filter.before) {
    conditions.push(`"timestamp" <= $${paramIdx++}`);
    params.push(filter.before);
  }

  // Cursor-based pagination: rank DESC, id ASC for deterministic ordering.
  // Cursor format: "rank:id" where rank is the float score and id is UUID.
  if (page.cursor) {
    const sepIdx = page.cursor.indexOf(':');
    if (sepIdx > 0) {
      const cursorRank = parseFloat(page.cursor.slice(0, sepIdx));
      const cursorId = page.cursor.slice(sepIdx + 1);
      if (!isNaN(cursorRank) && cursorId) {
        conditions.push(
          `(ts_rank(search_vector, websearch_to_tsquery('english', $${queryParamIdx})), id) < ($${paramIdx}, $${paramIdx + 1})`,
        );
        params.push(cursorRank, cursorId);
        paramIdx += 2;
      }
    }
  }

  const where = conditions.join(' AND ');

  // Fetch one extra row to determine if there's a next page
  params.push(limit + 1);
  const limitParamIdx = paramIdx;

  const sql = `
    SELECT
      e.*,
      ts_rank(e.search_vector, websearch_to_tsquery('english', $${queryParamIdx})) AS rank,
      ts_headline(
        'english',
        coalesce(e.type, '') || ' ' || coalesce(e.source_agent, '') || ' ' || e.payload::text,
        websearch_to_tsquery('english', $${queryParamIdx}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=3, FragmentDelimiter= … '
      ) AS headline
    FROM events e
    WHERE ${where}
    ORDER BY rank DESC, e.id ASC
    LIMIT $${limitParamIdx}
  `;

  const result = await pool.query<SearchEventRow>(sql, params);

  const hasMore = result.rows.length > limit;
  const events = hasMore ? result.rows.slice(0, limit) : result.rows;

  // Build next cursor from last row
  let nextCursor: string | null = null;
  if (hasMore) {
    const lastEvent = events[events.length - 1];
    if (lastEvent) {
      nextCursor = `${lastEvent.rank}:${lastEvent.id}`;
    }
  }

  // Estimate total matches using a cheaper count approach
  let totalEstimate = events.length;
  if (hasMore) {
    // Only run count if there are more pages
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM events
      WHERE search_vector @@ websearch_to_tsquery('english', $1)
      ${filter.tenantId ? `AND tenant_id = $2` : ''}
    `;
    const countParams: unknown[] = [filter.query];
    if (filter.tenantId) countParams.push(filter.tenantId);

    const countResult = await pool.query<{ total: number }>(countSql, countParams);
    totalEstimate = countResult.rows[0]?.total ?? events.length;
  }

  return { events, nextCursor, totalEstimate };
}
