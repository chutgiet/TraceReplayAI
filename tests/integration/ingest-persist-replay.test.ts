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
import { ingestEvent, ingestEventBatch } from '../../services/ingest-api/src/services/ingest-service.js';
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

  // Apply migration (idempotent — uses IF NOT EXISTS)
  const migrationPath = resolve(
    __dirname,
    '../../infrastructure/db/migrations/001_initial_schema.sql',
  );
  const migrationSql = readFileSync(migrationPath, 'utf-8');
  await pool.query(migrationSql);
});

beforeEach(async () => {
  // Clean tables between tests (events first due to FK constraint)
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

describe('Integration: ingest → persist → replay', () => {
  // -----------------------------------------------------------------------
  // Simple chat run — full happy path
  // -----------------------------------------------------------------------
  describe('simple-chat-run', () => {
    it('ingests all events, persists to DB, and produces a correct timeline', async () => {
      const events = loadFixture('simple-chat-run');
      const runId = events[0]!.runId;

      // 1. Ingest
      for (const event of events) {
        const result = await ingestEvent(event, pool);
        expect(result.status).toBe('created');
      }

      // 2. Verify persistence
      const rows = await getEventsByRunId(runId, pool);
      expect(rows).toHaveLength(events.length);

      // Verify run row was created and status updated by run.end
      const runResult = await pool.query('SELECT * FROM runs WHERE id = $1', [
        runId,
      ]);
      expect(runResult.rows).toHaveLength(1);
      expect(runResult.rows[0]!.status).toBe('success');

      // 3. Map DB rows → domain events → replay
      const replayEvents = rows.map(eventRowToEvent);
      const timeline = buildTimeline(replayEvents);

      // 4. Assert timeline
      expect(timeline.entries).toHaveLength(events.length);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.runId).toBe(runId);
      expect(timeline.summary.status).toBe('success');
      expect(timeline.summary.hasGaps).toBe(false);
      expect(timeline.summary.hasErrors).toBe(false);
      expect(timeline.summary.eventCount).toBe(events.length);

      // Chronological ordering preserved
      for (let i = 1; i < timeline.entries.length; i++) {
        const prev = timeline.entries[i - 1]!;
        const curr = timeline.entries[i]!;
        expect(curr.event.timestamp >= prev.event.timestamp).toBe(true);
      }

      // All expected event types present
      const types = timeline.entries.map((e) => e.event.type);
      expect(types).toContain('run.start');
      expect(types).toContain('run.end');
      expect(types).toContain('prompt.input');
      expect(types).toContain('prompt.output');
      expect(types).toContain('model.request');
      expect(types).toContain('model.response');
    });
  });

  // -----------------------------------------------------------------------
  // Multi-tool run — complex flow with tool calls, side effects, policy
  // -----------------------------------------------------------------------
  describe('multi-tool-run', () => {
    it('batch-ingests events and replays with tool durations and causal links', async () => {
      const events = loadFixture('multi-tool-run');
      const runId = events[0]!.runId;

      // 1. Batch ingest
      const results = await ingestEventBatch(events, pool);
      expect(results).toHaveLength(events.length);
      results.forEach((r) => expect(r.status).toBe('created'));

      // 2. Verify persistence
      const rows = await getEventsByRunId(runId, pool);
      expect(rows).toHaveLength(events.length);

      // 3. Map + replay
      const replayEvents = rows.map(eventRowToEvent);
      const timeline = buildTimeline(replayEvents);

      // 4. Assert timeline
      expect(timeline.entries).toHaveLength(events.length);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.status).toBe('success');
      expect(timeline.summary.toolCount).toBe(2); // web-search + calculator
      expect(timeline.summary.hasErrors).toBe(false);

      // Tool call durations computed from start→end pairs
      const toolStarts = timeline.entries.filter(
        (e) => e.event.type === 'tool.call.start',
      );
      expect(toolStarts).toHaveLength(2);
      for (const ts of toolStarts) {
        expect(ts.durationMs).toBeDefined();
        expect(ts.durationMs).toBeGreaterThanOrEqual(0);
      }

      // Causal depth: context.injected has parent context.retrieved
      const contextInjected = timeline.entries.find(
        (e) => e.event.type === 'context.injected',
      );
      expect(contextInjected).toBeDefined();
      expect(contextInjected!.depth).toBeGreaterThan(0);

      // Event type diversity — verify multi-category event types are in timeline
      const types = new Set(timeline.entries.map((e) => e.event.type));
      expect(types.has('side_effect.executed')).toBe(true);
      expect(types.has('policy.evaluated')).toBe(true);
      expect(types.has('annotation')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Error run — tool failure + fatal run error
  // -----------------------------------------------------------------------
  describe('error-run', () => {
    it('persists error events and replay reflects error state', async () => {
      const events = loadFixture('error-run');
      const runId = events[0]!.runId;

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      // Verify run status set to failure (fatal run.error)
      const runResult = await pool.query('SELECT * FROM runs WHERE id = $1', [
        runId,
      ]);
      expect(runResult.rows[0]!.status).toBe('failure');

      // Map + replay
      const rows = await getEventsByRunId(runId, pool);
      const timeline = buildTimeline(rows.map(eventRowToEvent));

      expect(timeline.summary.hasErrors).toBe(true);

      // Both tool.call.error and run.error are present
      const errorTypes = timeline.entries
        .filter(
          (e) =>
            e.event.type === 'run.error' ||
            e.event.type === 'tool.call.error' ||
            e.event.type === 'side_effect.failed',
        )
        .map((e) => e.event.type);

      expect(errorTypes).toContain('tool.call.error');
      expect(errorTypes).toContain('run.error');
      expect(errorTypes).toContain('side_effect.failed');
    });
  });

  // -----------------------------------------------------------------------
  // Partial telemetry — missing run.start and run.end → gaps detected
  // -----------------------------------------------------------------------
  describe('partial-telemetry-run', () => {
    it('detects gaps when run lifecycle events are missing', async () => {
      const events = loadFixture('partial-telemetry-run');
      const runId = events[0]!.runId;

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const rows = await getEventsByRunId(runId, pool);
      const timeline = buildTimeline(rows.map(eventRowToEvent));

      // Partial telemetry should have gaps
      expect(timeline.summary.hasGaps).toBe(true);
      expect(timeline.gaps.length).toBeGreaterThan(0);

      // Expect missing_run_start and missing_run_end gaps
      const gapTypes = timeline.gaps.map((g) => g.type);
      expect(gapTypes).toContain('missing_run_start');
      expect(gapTypes).toContain('missing_run_end');

      // Orphan tool.call.end (no matching start)
      expect(gapTypes).toContain('orphan_tool_end');
    });
  });

  // -----------------------------------------------------------------------
  // Approval denied run — approval flow + policy + custom events
  // -----------------------------------------------------------------------
  describe('approval-denied-run', () => {
    it('captures approval flow and policy evaluation in timeline', async () => {
      const events = loadFixture('approval-denied-run');
      const runId = events[0]!.runId;

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const rows = await getEventsByRunId(runId, pool);
      const timeline = buildTimeline(rows.map(eventRowToEvent));

      expect(timeline.summary.status).toBe('cancelled');
      expect(timeline.entries).toHaveLength(events.length);
      expect(timeline.gaps).toHaveLength(0);

      // Approval events present
      const denied = timeline.entries.find(
        (e) => e.event.type === 'approval.denied',
      );
      expect(denied).toBeDefined();

      // approval.denied is a child of approval.requested (causal link)
      expect(denied!.depth).toBeGreaterThan(0);
      expect(denied!.event.parentEventId).toBeDefined();

      // Policy events
      const types = new Set(timeline.entries.map((e) => e.event.type));
      expect(types.has('policy.evaluated')).toBe(true);
      expect(types.has('policy.violated')).toBe(true);
      expect(types.has('custom')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency — duplicate event ingestion
  // -----------------------------------------------------------------------
  describe('idempotent ingestion', () => {
    it('returns duplicate on re-ingest and does not create extra rows', async () => {
      const events = loadFixture('simple-chat-run');

      // Ingest first event
      const first = await ingestEvent(events[0]!, pool);
      expect(first.status).toBe('created');

      // Re-ingest same event
      const second = await ingestEvent(events[0]!, pool);
      expect(second.status).toBe('duplicate');

      // Only one event row in DB
      const rows = await getEventsByRunId(events[0]!.runId, pool);
      expect(rows).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-run isolation — two runs ingested, each replayed independently
  // -----------------------------------------------------------------------
  describe('cross-run isolation', () => {
    it('replays each run independently without cross-contamination', async () => {
      const simpleEvents = loadFixture('simple-chat-run');
      const errorEvents = loadFixture('error-run');

      // Ingest both runs
      for (const event of simpleEvents) {
        await ingestEvent(event, pool);
      }
      for (const event of errorEvents) {
        await ingestEvent(event, pool);
      }

      // Replay simple-chat
      const simpleRows = await getEventsByRunId(simpleEvents[0]!.runId, pool);
      const simpleTimeline = buildTimeline(simpleRows.map(eventRowToEvent));

      expect(simpleTimeline.entries).toHaveLength(simpleEvents.length);
      expect(simpleTimeline.summary.status).toBe('success');
      expect(simpleTimeline.summary.hasErrors).toBe(false);

      // Replay error-run
      const errorRows = await getEventsByRunId(errorEvents[0]!.runId, pool);
      const errorTimeline = buildTimeline(errorRows.map(eventRowToEvent));

      expect(errorTimeline.entries).toHaveLength(errorEvents.length);
      expect(errorTimeline.summary.hasErrors).toBe(true);

      // Run IDs are distinct
      expect(simpleTimeline.summary.runId).not.toBe(
        errorTimeline.summary.runId,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Event payload integrity — data round-trips without corruption
  // -----------------------------------------------------------------------
  describe('payload integrity', () => {
    it('preserves event payloads through the DB round-trip', async () => {
      const events = loadFixture('multi-tool-run');
      const runId = events[0]!.runId;

      await ingestEventBatch(events, pool);

      const rows = await getEventsByRunId(runId, pool);
      const replayEvents = rows.map(eventRowToEvent);

      // Verify a tool.call.start payload is preserved
      const originalToolStart = events.find(
        (e) => e.type === 'tool.call.start',
      )!;
      const dbToolStart = replayEvents.find(
        (e) => e.type === 'tool.call.start' && e.id === originalToolStart.id,
      )!;

      const originalToolPayload = originalToolStart.payload as unknown as Record<string, unknown>;
      const dbToolPayload = dbToolStart.payload as unknown as Record<string, unknown>;
      expect(dbToolPayload['toolName']).toBe(originalToolPayload['toolName']);
      expect(dbToolPayload['inputParameters']).toEqual(
        originalToolPayload['inputParameters'],
      );

      // Verify a prompt.input content is preserved
      const originalPrompt = events.find((e) => e.type === 'prompt.input')!;
      const dbPrompt = replayEvents.find(
        (e) => e.type === 'prompt.input' && e.id === originalPrompt.id,
      )!;

      const originalPromptPayload = originalPrompt.payload as unknown as Record<string, unknown>;
      const dbPromptPayload = dbPrompt.payload as unknown as Record<string, unknown>;
      expect(dbPromptPayload['content']).toBe(originalPromptPayload['content']);
      expect(dbPromptPayload['tokenCount']).toBe(
        originalPromptPayload['tokenCount'],
      );
    });
  });

  // -----------------------------------------------------------------------
  // All fixtures — validate every fixture round-trips
  // -----------------------------------------------------------------------
  describe('all fixtures round-trip', () => {
    it.each([
      'simple-chat-run',
      'multi-tool-run',
      'error-run',
      'partial-telemetry-run',
      'approval-denied-run',
    ] as const)('%s: ingest → persist → replay succeeds', async (fixtureName) => {
      const events = loadFixture(fixtureName);
      const runId = events[0]!.runId;

      // Ingest all events
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      // Verify all persisted
      const rows = await getEventsByRunId(runId, pool);
      expect(rows).toHaveLength(events.length);

      // Replay produces a timeline with the right number of entries
      const timeline = buildTimeline(rows.map(eventRowToEvent));
      expect(timeline.entries).toHaveLength(events.length);
      expect(timeline.summary.eventCount).toBe(events.length);
    });
  });
});
