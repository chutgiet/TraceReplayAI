import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import { validateEvent } from '@tracereplay/event-schema';
import { getEventsByRunId } from '@tracereplay/common';
import type { EventRow } from '@tracereplay/common';
import { buildTimeline } from '@tracereplay/replay-engine';
import { ingestEvent } from '../../services/ingest-api/src/services/ingest-service.js';
import { loadFixture } from '../fixtures/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a database EventRow back to a domain TraceReplayEvent. */
function eventRowToEvent(row: EventRow): TraceReplayEvent {
  const raw: Record<string, unknown> = {
    id: row.id,
    runId: row.run_id,
    type: row.type,
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : row.timestamp,
    tenantId: row.tenant_id,
    sourceAgent: row.source_agent,
    payload:
      typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    schemaVersion: row.schema_version,
  };

  if (row.sequence != null) raw['sequence'] = row.sequence;
  if (row.parent_event_id) raw['parentEventId'] = row.parent_event_id;
  if (row.source_framework) raw['sourceFramework'] = row.source_framework;
  if (row.raw_meta) {
    raw['rawMeta'] =
      typeof row.raw_meta === 'string'
        ? JSON.parse(row.raw_meta)
        : row.raw_meta;
  }
  if (row.tags && row.tags.length > 0) raw['tags'] = row.tags;

  const result = validateEvent(raw);
  if (!result.success) {
    throw new Error(
      `eventRowToEvent failed: ${JSON.stringify(result.error.issues)}`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let pool: Pool;

beforeAll(async () => {
  const connStr =
    process.env['DATABASE_URL'] ??
    'postgres://tracereplay:tracereplay@localhost:5432/tracereplay';
  pool = new Pool({ connectionString: connStr, max: 5 });

  // Verify connectivity
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new Error(
      'PostgreSQL is not reachable. Start it with: docker compose up -d postgres',
    );
  }

  // Apply migrations (idempotent)
  const migration001 = resolve(
    __dirname,
    '../../infrastructure/db/migrations/001_initial_schema.sql',
  );
  await pool.query(readFileSync(migration001, 'utf-8'));

  const migration002 = resolve(
    __dirname,
    '../../infrastructure/db/migrations/002_add_ingestion_order.sql',
  );
  await pool.query(readFileSync(migration002, 'utf-8'));
});

beforeEach(async () => {
  await pool.query('DELETE FROM events');
  await pool.query('DELETE FROM runs');
});

afterAll(async () => {
  if (pool) {
    await pool.query('DELETE FROM events');
    await pool.query('DELETE FROM runs');
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: out-of-order event handling', () => {
  // -----------------------------------------------------------------------
  // Core test: events arrive out of order, timeline is correctly ordered
  // -----------------------------------------------------------------------
  it('produces a correctly ordered timeline from out-of-order event delivery', async () => {
    // The out-of-order fixture has events listed in scrambled arrival order:
    // Arrival order:  seq 3, 6, 1, 5, 2, 4
    // Correct order:  seq 1, 2, 3, 4, 5, 6
    const events = loadFixture('out-of-order-run');
    const runId = events[0]!.runId;

    // Ingest events one at a time (simulating out-of-order arrival)
    for (const event of events) {
      const result = await ingestEvent(event, pool);
      expect(result.status).toBe('created');
    }

    // Fetch from DB (should be ordered by timestamp + sequence)
    const rows = await getEventsByRunId(runId, pool);
    expect(rows).toHaveLength(events.length);

    // Verify DB rows are returned in chronological order (not arrival order)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      expect(curr.timestamp.getTime()).toBeGreaterThanOrEqual(prev.timestamp.getTime());
    }

    // Build replay timeline
    const replayEvents = rows.map(eventRowToEvent);
    const timeline = buildTimeline(replayEvents);

    // Timeline should have all events correctly ordered
    expect(timeline.entries).toHaveLength(6);
    expect(timeline.gaps).toHaveLength(0);
    expect(timeline.summary.status).toBe('success');
    expect(timeline.summary.hasGaps).toBe(false);

    // Verify chronological ordering: timestamps are non-decreasing
    for (let i = 1; i < timeline.entries.length; i++) {
      const prev = timeline.entries[i - 1]!;
      const curr = timeline.entries[i]!;
      expect(curr.event.timestamp >= prev.event.timestamp).toBe(true);
    }

    // Verify sequence ordering: sequences are ascending
    const sequences = timeline.entries
      .map((e) => e.event.sequence)
      .filter((s): s is number => s != null);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]!).toBeGreaterThan(sequences[i - 1]!);
    }

    // Verify correct event type ordering
    const types = timeline.entries.map((e) => e.event.type);
    expect(types[0]).toBe('run.start');
    expect(types[types.length - 1]).toBe('run.end');
  });

  // -----------------------------------------------------------------------
  // run.start arrives last — run is still correctly reconstructed
  // -----------------------------------------------------------------------
  it('reconstructs run correctly when run.start arrives after other events', async () => {
    const events = loadFixture('out-of-order-run');
    const runId = events[0]!.runId;

    // Rearrange: send everything EXCEPT run.start first, then run.start last
    const runStart = events.find((e) => e.type === 'run.start')!;
    const others = events.filter((e) => e.type !== 'run.start');

    for (const event of others) {
      await ingestEvent(event, pool);
    }

    // run.start arrives last
    await ingestEvent(runStart, pool);

    // Verify the run row exists and has completed status
    const runResult = await pool.query('SELECT * FROM runs WHERE id = $1', [runId]);
    expect(runResult.rows).toHaveLength(1);
    expect(runResult.rows[0]!.status).toBe('success');

    // Build timeline and verify correctness
    const rows = await getEventsByRunId(runId, pool);
    const timeline = buildTimeline(rows.map(eventRowToEvent));

    expect(timeline.entries).toHaveLength(6);
    expect(timeline.entries[0]!.event.type).toBe('run.start');
    expect(timeline.entries[timeline.entries.length - 1]!.event.type).toBe('run.end');
    expect(timeline.gaps).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Ingestion order is tracked independently of source order
  // -----------------------------------------------------------------------
  it('tracks ingestion_order independently of source timestamp order', async () => {
    const events = loadFixture('out-of-order-run');
    const runId = events[0]!.runId;

    // Ingest in fixture order (scrambled)
    for (const event of events) {
      await ingestEvent(event, pool);
    }

    // Query events ordered by ingestion_order (arrival order)
    const arrivalResult = await pool.query<EventRow>(
      `SELECT * FROM events WHERE run_id = $1 ORDER BY ingestion_order`,
      [runId],
    );
    const arrivalSequences = arrivalResult.rows.map((r) => r.sequence);

    // Arrival order should reflect the scrambled fixture order: 3, 6, 1, 5, 2, 4
    expect(arrivalSequences).toEqual([3, 6, 1, 5, 2, 4]);

    // Source order (from getEventsByRunId) should be sorted: 1, 2, 3, 4, 5, 6
    const sourceRows = await getEventsByRunId(runId, pool);
    const sourceSequences = sourceRows.map((r) => r.sequence);
    expect(sourceSequences).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // -----------------------------------------------------------------------
  // Timeline consistency: same timeline regardless of ingestion order
  // -----------------------------------------------------------------------
  it('produces identical timeline whether events arrive in-order or out-of-order', async () => {
    // First: ingest the simple-chat-run (in order)
    const inOrderEvents = loadFixture('simple-chat-run');
    for (const event of inOrderEvents) {
      await ingestEvent(event, pool);
    }
    const inOrderRows = await getEventsByRunId(inOrderEvents[0]!.runId, pool);
    const inOrderTimeline = buildTimeline(inOrderRows.map(eventRowToEvent));

    // Clean up
    await pool.query('DELETE FROM events');
    await pool.query('DELETE FROM runs');

    // Second: ingest the same events in reverse order
    const reversed = [...inOrderEvents].reverse();
    for (const event of reversed) {
      await ingestEvent(event, pool);
    }
    const reversedRows = await getEventsByRunId(inOrderEvents[0]!.runId, pool);
    const reversedTimeline = buildTimeline(reversedRows.map(eventRowToEvent));

    // Both timelines should have the same structure
    expect(reversedTimeline.entries).toHaveLength(inOrderTimeline.entries.length);
    expect(reversedTimeline.summary.status).toBe(inOrderTimeline.summary.status);
    expect(reversedTimeline.summary.eventCount).toBe(inOrderTimeline.summary.eventCount);
    expect(reversedTimeline.gaps).toHaveLength(inOrderTimeline.gaps.length);

    // Event ordering must be identical
    for (let i = 0; i < inOrderTimeline.entries.length; i++) {
      expect(reversedTimeline.entries[i]!.event.id).toBe(
        inOrderTimeline.entries[i]!.event.id,
      );
    }
  });
});
