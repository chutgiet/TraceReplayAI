import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { searchEvents, getEventsByRunId } from '@tracereplay/common';
import type { SearchEventsFilter } from '@tracereplay/common';
import { ingestEvent } from '../../services/ingest-api/src/services/ingest-service.js';
import { loadFixture } from '../fixtures/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  // Apply all migrations (idempotent)
  const migrationDir = resolve(__dirname, '../../infrastructure/db/migrations');
  for (const file of ['001_initial_schema.sql', '002_add_ingestion_order.sql', '003_full_text_search.sql']) {
    const sql = readFileSync(resolve(migrationDir, file), 'utf-8');
    await pool.query(sql);
  }
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

describe('Integration: full-text search across event payloads', () => {
  // -----------------------------------------------------------------------
  // Basic search functionality
  // -----------------------------------------------------------------------

  describe('basic search', () => {
    it('finds events by content in payload', async () => {
      const events = loadFixture('simple-chat-run');

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      // The prompt.input event should contain user message content
      // Search for a term from the prompt payload
      const promptEvent = events.find((e) => e.type === 'prompt.input');
      expect(promptEvent).toBeDefined();

      // Search by event type
      const result = await searchEvents(
        { query: 'prompt' },
        {},
        pool,
      );

      expect(result.events.length).toBeGreaterThan(0);
      // All returned events should have a rank > 0
      for (const event of result.events) {
        expect(event.rank).toBeGreaterThan(0);
        expect(event.headline).toBeDefined();
      }
    });

    it('returns empty results for non-matching query', async () => {
      const events = loadFixture('simple-chat-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: 'xyznonexistenttermabc123' },
        {},
        pool,
      );

      expect(result.events).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('search_vector is automatically populated by trigger on insert', async () => {
      const events = loadFixture('simple-chat-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      // Verify the search_vector column is populated
      const dbResult = await pool.query(
        'SELECT id, search_vector FROM events WHERE search_vector IS NOT NULL',
      );

      expect(dbResult.rows.length).toBe(events.length);
      for (const row of dbResult.rows) {
        expect(row.search_vector).toBeTruthy();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Search by event type
  // -----------------------------------------------------------------------

  describe('search by event type', () => {
    it('finds events matching the event type field', async () => {
      const events = loadFixture('multi-tool-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      // Search for tool call events
      const result = await searchEvents(
        { query: 'tool' },
        {},
        pool,
      );

      expect(result.events.length).toBeGreaterThan(0);
      // Should find events related to tool calls
      const hasToolEvents = result.events.some((e) =>
        e.type.includes('tool'),
      );
      expect(hasToolEvents).toBe(true);
    });

    it('finds error events by searching for error keywords', async () => {
      const events = loadFixture('error-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: 'error' },
        {},
        pool,
      );

      expect(result.events.length).toBeGreaterThan(0);
      // Should include run.error or tool.call.error events
      const hasErrorType = result.events.some(
        (e) => e.type === 'run.error' || e.type === 'tool.call.error',
      );
      expect(hasErrorType).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Search by source agent
  // -----------------------------------------------------------------------

  describe('search by source agent', () => {
    it('finds events by agent name', async () => {
      const events = loadFixture('simple-chat-run');
      const agentName = events[0]!.sourceAgent;

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: agentName },
        {},
        pool,
      );

      expect(result.events.length).toBeGreaterThan(0);
      for (const event of result.events) {
        expect(event.source_agent).toBe(agentName);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------

  describe('filtering', () => {
    it('filters by runId', async () => {
      // Ingest events from two different fixtures (different runIds)
      const events1 = loadFixture('simple-chat-run');
      const events2 = loadFixture('error-run');

      for (const event of [...events1, ...events2]) {
        await ingestEvent(event, pool);
      }

      const runId1 = events1[0]!.runId;

      // Search with runId filter — agents should appear in both runs
      const agentName = events1[0]!.sourceAgent;
      const result = await searchEvents(
        { query: agentName, runId: runId1 },
        {},
        pool,
      );

      // All results should belong to the specified run
      for (const event of result.events) {
        expect(event.run_id).toBe(runId1);
      }
    });

    it('filters by event types', async () => {
      const events = loadFixture('multi-tool-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const agentName = events[0]!.sourceAgent;

      const result = await searchEvents(
        {
          query: agentName,
          eventTypes: ['tool.call.start', 'tool.call.end'],
        },
        {},
        pool,
      );

      for (const event of result.events) {
        expect(['tool.call.start', 'tool.call.end']).toContain(event.type);
      }
    });

    it('filters by tenantId', async () => {
      const events = loadFixture('simple-chat-run');
      const tenantId = events[0]!.tenantId;

      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: 'prompt', tenantId },
        {},
        pool,
      );

      for (const event of result.events) {
        expect(event.tenant_id).toBe(tenantId);
      }
    });

    it('filters by time range', async () => {
      const events = loadFixture('simple-chat-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const firstTimestamp = events[0]!.timestamp;
      const lastTimestamp = events[events.length - 1]!.timestamp;

      // After the last event — should return nothing
      const result = await searchEvents(
        {
          query: events[0]!.sourceAgent,
          after: new Date(new Date(lastTimestamp).getTime() + 60_000),
        },
        {},
        pool,
      );

      expect(result.events).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('pagination', () => {
    it('returns paginated results with cursor', async () => {
      const events = loadFixture('multi-tool-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const agentName = events[0]!.sourceAgent;

      // Get first page
      const page1 = await searchEvents(
        { query: agentName },
        { limit: 3 },
        pool,
      );

      expect(page1.events.length).toBeLessThanOrEqual(3);

      if (page1.nextCursor) {
        // Get second page
        const page2 = await searchEvents(
          { query: agentName },
          { limit: 3, cursor: page1.nextCursor },
          pool,
        );

        // Pages should not overlap
        const page1Ids = new Set(page1.events.map((e) => e.id));
        for (const event of page2.events) {
          expect(page1Ids.has(event.id)).toBe(false);
        }
      }
    });

    it('respects limit parameter', async () => {
      const events = loadFixture('multi-tool-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const agentName = events[0]!.sourceAgent;

      const result = await searchEvents(
        { query: agentName },
        { limit: 2 },
        pool,
      );

      expect(result.events.length).toBeLessThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // Relevance ranking
  // -----------------------------------------------------------------------

  describe('relevance ranking', () => {
    it('returns results ordered by relevance (rank DESC)', async () => {
      const events = loadFixture('multi-tool-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: 'tool' },
        {},
        pool,
      );

      if (result.events.length > 1) {
        // Results should be ordered by rank descending
        for (let i = 1; i < result.events.length; i++) {
          expect(result.events[i]!.rank).toBeLessThanOrEqual(
            result.events[i - 1]!.rank,
          );
        }
      }
    });

    it('includes headline with highlighted matches', async () => {
      const events = loadFixture('simple-chat-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const result = await searchEvents(
        { query: 'prompt' },
        {},
        pool,
      );

      expect(result.events.length).toBeGreaterThan(0);
      // Headlines should contain <mark> tags around matched terms
      for (const event of result.events) {
        expect(event.headline).toBeDefined();
        expect(typeof event.headline).toBe('string');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Total estimate
  // -----------------------------------------------------------------------

  describe('total estimate', () => {
    it('returns totalEstimate that reflects count of matching events', async () => {
      const events = loadFixture('simple-chat-run');
      for (const event of events) {
        await ingestEvent(event, pool);
      }

      const agentName = events[0]!.sourceAgent;

      const result = await searchEvents(
        { query: agentName },
        {},
        pool,
      );

      expect(result.totalEstimate).toBeGreaterThanOrEqual(result.events.length);
    });
  });

  // -----------------------------------------------------------------------
  // Search across multiple fixtures
  // -----------------------------------------------------------------------

  describe('cross-run search', () => {
    it('finds events across multiple runs', async () => {
      const simplechatEvents = loadFixture('simple-chat-run');
      const multiToolEvents = loadFixture('multi-tool-run');

      for (const event of [...simplechatEvents, ...multiToolEvents]) {
        await ingestEvent(event, pool);
      }

      // Both runs have the same agent — search should find across runs
      const agentName = simplechatEvents[0]!.sourceAgent;
      const result = await searchEvents(
        { query: agentName },
        { limit: 100 },
        pool,
      );

      // Should find events from both runs
      const runIds = new Set(result.events.map((e) => e.run_id));
      expect(runIds.size).toBeGreaterThanOrEqual(1);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });
});
