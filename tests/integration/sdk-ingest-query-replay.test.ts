import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { TraceReplayClient, RunTracer } from '@tracereplay/sdk-typescript';
import type { HttpTransport, HttpResponse } from '@tracereplay/sdk-typescript';
import { buildApp as buildIngestApp } from '../../services/ingest-api/src/index.js';
import { buildApp as buildQueryApp } from '../../services/query-service/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types for API responses
// ---------------------------------------------------------------------------

interface ApiEnvelope<T = unknown> {
  data: T;
  meta: Record<string, unknown>;
  error?: { code: string; message: string };
}

interface RunResponse {
  id: string;
  tenantId: string;
  agentId: string;
  runName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  summary?: { eventCount: number; durationMs: number | null; status: string };
}

interface EventResponse {
  id: string;
  runId: string;
  type: string;
  sequence: number | null;
  parentEventId: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface TimelineResponse {
  entries: Array<{
    event: { id: string; type: string; timestamp: string; sequence?: number };
    index: number;
    depth: number;
    durationMs?: number;
    childEventIds: string[];
  }>;
  gaps: Array<{ type: string; message: string; relatedEventIds: string[] }>;
  summary: {
    runId: string;
    eventCount: number;
    status?: string;
    hasGaps: boolean;
    hasErrors: boolean;
    toolCount: number;
  };
}

// ---------------------------------------------------------------------------
// Fastify-backed HTTP transport for the SDK
// ---------------------------------------------------------------------------

/**
 * Creates an HttpTransport that routes SDK HTTP calls to a Fastify app
 * via `app.inject()` — no real network sockets needed.
 */
function createFastifyTransport(app: FastifyInstance): HttpTransport {
  return async (
    url: string,
    options: { method: string; headers: Record<string, string>; body: string },
  ): Promise<HttpResponse> => {
    // Extract the path from the full URL (SDK sends e.g. "http://localhost:3001/v1/events")
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname + parsedUrl.search;

    const res = await app.inject({
      method: options.method as 'POST' | 'GET',
      url: path,
      headers: options.headers,
      payload: options.body,
    });

    const body = res.json();
    return { status: res.statusCode, body };
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let pool: Pool;
let ingestApp: FastifyInstance;
let queryApp: FastifyInstance;

beforeAll(async () => {
  // Connect to PostgreSQL
  const connStr =
    process.env['DATABASE_URL'] ??
    'postgres://tracereplay:tracereplay@localhost:5432/tracereplay';
  pool = new Pool({ connectionString: connStr, max: 5 });

  try {
    await pool.query('SELECT 1');
  } catch {
    throw new Error(
      'PostgreSQL is not reachable. Start it with: docker compose up -d postgres',
    );
  }

  // Apply migrations idempotently
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

  // Build Fastify apps (not listening — we use inject())
  ingestApp = await buildIngestApp();
  queryApp = await buildQueryApp();
});

beforeEach(async () => {
  await pool.query('DELETE FROM events');
  await pool.query('DELETE FROM runs');
});

afterAll(async () => {
  try {
    if (pool) {
      await pool.query('DELETE FROM events');
      await pool.query('DELETE FROM runs');
      await pool.end();
    }
  } catch {
    // Pool may not have connected — nothing to clean up
    await pool?.end().catch(() => {});
  }
  await ingestApp?.close().catch(() => {});
  await queryApp?.close().catch(() => {});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSdkClient(): TraceReplayClient {
  const transport = createFastifyTransport(ingestApp);
  return new TraceReplayClient(
    {
      endpoint: 'http://localhost:3001',
      tenantId: 'tenant-integ-001',
      flushIntervalMs: 100_000, // prevent auto-flush
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 10 },
    },
    transport,
  );
}

async function queryGetRaw(path: string) {
  return queryApp.inject({ method: 'GET', url: path });
}

/** Small delay to let DB transactions settle (only if needed). */
function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: SDK → Ingest API → Query Service → Replay', () => {
  // =========================================================================
  // 1. Simple chat run — full happy path through all layers
  // =========================================================================
  describe('simple chat run: full end-to-end flow', () => {
    let client: TraceReplayClient;
    let runTracer: RunTracer;
    let runId: string;

    // Track event IDs for assertion
    const eventIds: string[] = [];

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
      eventIds.length = 0;
    });

    it('SDK sends events → ingest persists → query returns run + events + timeline', async () => {
      // ── Step 1: SDK generates and sends events via RunTracer ──
      runTracer = client.startRun({
        runName: 'simple-chat-integration',
        triggerSource: 'user',
        sourceAgent: 'integration-test-agent',
        sourceFramework: 'vitest',
        tags: ['integration', 'sdk-flow'],
      });
      runId = runTracer.runId;

      // Allow run.start to be sent
      await tick(50);

      // Prompt input
      const promptResult = await runTracer.logPrompt({
        role: 'user',
        content: 'What is the capital of France?',
        tokenCount: 8,
      });
      expect(promptResult.status).toBe('created');
      eventIds.push(promptResult.eventId);

      // Prompt output
      const outputResult = await runTracer.logPromptOutput({
        content: 'The capital of France is Paris.',
        tokenCount: 12,
        finishReason: 'stop',
        modelId: 'gpt-4',
      });
      expect(outputResult.status).toBe('created');
      eventIds.push(outputResult.eventId);

      // End run
      const endResult = await runTracer.end('success', {
        durationMs: 1500,
        summary: 'Answered user question about France.',
      });
      expect(endResult.status).toBe('created');
      eventIds.push(endResult.eventId);

      // ── Step 2: Query Service — list runs ──
      const listRes = await queryGetRaw('/v1/runs');
      expect(listRes.statusCode).toBe(200);

      const listBody = listRes.json() as ApiEnvelope<RunResponse[]>;
      expect(listBody.data.length).toBeGreaterThanOrEqual(1);

      const run = listBody.data.find((r) => r.id === runId);
      expect(run).toBeDefined();
      expect(run!.tenantId).toBe('tenant-integ-001');
      expect(run!.agentId).toBe('integration-test-agent');
      expect(run!.status).toBe('success');

      // ── Step 3: Query Service — get run details ──
      const detailRes = await queryGetRaw(`/v1/runs/${runId}`);
      expect(detailRes.statusCode).toBe(200);

      const detailBody = detailRes.json() as ApiEnvelope<RunResponse>;
      expect(detailBody.data.id).toBe(runId);
      expect(detailBody.data.status).toBe('success');
      expect(detailBody.data.summary).toBeDefined();
      expect(detailBody.data.summary!.eventCount).toBeGreaterThanOrEqual(4); // run.start + prompt.input + prompt.output + run.end

      // ── Step 4: Query Service — get events for run ──
      const eventsRes = await queryGetRaw(`/v1/runs/${runId}/events`);
      expect(eventsRes.statusCode).toBe(200);

      const eventsBody = eventsRes.json() as ApiEnvelope<EventResponse[]>;
      expect(eventsBody.data.length).toBeGreaterThanOrEqual(4);

      // Events should be in chronological order
      for (let i = 1; i < eventsBody.data.length; i++) {
        expect(eventsBody.data[i]!.timestamp >= eventsBody.data[i - 1]!.timestamp).toBe(true);
      }

      // Verify expected event types are present
      const types = eventsBody.data.map((e) => e.type);
      expect(types).toContain('run.start');
      expect(types).toContain('prompt.input');
      expect(types).toContain('prompt.output');
      expect(types).toContain('run.end');

      // Verify payload integrity
      const promptEvent = eventsBody.data.find((e) => e.type === 'prompt.input')!;
      expect(promptEvent.payload['content']).toBe('What is the capital of France?');
      expect(promptEvent.payload['tokenCount']).toBe(8);
      expect(promptEvent.payload['role']).toBe('user');

      const outputEvent = eventsBody.data.find((e) => e.type === 'prompt.output')!;
      expect(outputEvent.payload['content']).toBe('The capital of France is Paris.');

      // ── Step 5: Query Service — replay timeline ──
      const timelineRes = await queryGetRaw(`/v1/runs/${runId}/timeline`);
      expect(timelineRes.statusCode).toBe(200);

      const timelineBody = timelineRes.json() as ApiEnvelope<TimelineResponse>;
      const timeline = timelineBody.data;

      expect(timeline.entries.length).toBeGreaterThanOrEqual(4);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.runId).toBe(runId);
      expect(timeline.summary.status).toBe('success');
      expect(timeline.summary.hasGaps).toBe(false);
      expect(timeline.summary.hasErrors).toBe(false);
      expect(timeline.summary.eventCount).toBeGreaterThanOrEqual(4);

      // Timeline entries should be chronologically ordered
      for (let i = 1; i < timeline.entries.length; i++) {
        expect(
          timeline.entries[i]!.event.timestamp >= timeline.entries[i - 1]!.event.timestamp,
        ).toBe(true);
      }

      // First and last event types
      expect(timeline.entries[0]!.event.type).toBe('run.start');
      expect(timeline.entries[timeline.entries.length - 1]!.event.type).toBe('run.end');
    });
  });

  // =========================================================================
  // 2. Multi-tool run — tools, side effects, causal linking
  // =========================================================================
  describe('multi-tool run with causal links', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('SDK sends tool calls → ingest persists → query timeline shows durations and causal depth', async () => {
      const runTracer = client.startRun({
        runName: 'multi-tool-integration',
        triggerSource: 'api',
        sourceAgent: 'tool-agent',
        sourceFramework: 'vitest',
      });
      const runId = runTracer.runId;
      await tick(50);

      // Prompt input
      const promptResult = await runTracer.logPrompt({
        role: 'user',
        content: 'Search for weather in Paris and calculate the average temperature',
        tokenCount: 15,
      });

      // Tool call 1: web-search  (with causal link to prompt)
      const toolStart1 = await runTracer.logToolCall(
        { toolName: 'web-search', inputParameters: { query: 'Paris weather' } },
        promptResult.eventId,
      );
      const toolEnd1 = await runTracer.logToolCallEnd(
        {
          toolName: 'web-search',
          output: { temperature: 22, conditions: 'sunny' },
          durationMs: 350,
          success: true,
        },
        toolStart1.eventId,
      );

      // Tool call 2: calculator  (with causal link to first tool)
      const toolStart2 = await runTracer.logToolCall(
        { toolName: 'calculator', inputParameters: { expression: '(22 + 18) / 2' } },
        toolEnd1.eventId,
      );
      await runTracer.logToolCallEnd(
        {
          toolName: 'calculator',
          output: { result: 20 },
          durationMs: 50,
          success: true,
        },
        toolStart2.eventId,
      );

      // Prompt output
      await runTracer.logPromptOutput({
        content: 'The average temperature in Paris is 20°C.',
        tokenCount: 14,
        finishReason: 'stop',
        modelId: 'gpt-4',
      });

      // End run
      await runTracer.end('success', { durationMs: 2500, summary: 'Weather query with tool use' });

      // ── Query: timeline ──
      const timelineRes = await queryGetRaw(`/v1/runs/${runId}/timeline`);
      expect(timelineRes.statusCode).toBe(200);

      const timeline = (timelineRes.json() as ApiEnvelope<TimelineResponse>).data;

      // Should have all events
      expect(timeline.entries.length).toBeGreaterThanOrEqual(8); // run.start + prompt.in + 2×(tool.start + tool.end) + prompt.out + run.end

      // No gaps
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.hasGaps).toBe(false);
      expect(timeline.summary.hasErrors).toBe(false);
      expect(timeline.summary.status).toBe('success');

      // Tool count should be 2
      expect(timeline.summary.toolCount).toBe(2);

      // Tool call entries should have durations computed
      const toolStarts = timeline.entries.filter((e) => e.event.type === 'tool.call.start');
      expect(toolStarts).toHaveLength(2);
      for (const ts of toolStarts) {
        expect(ts.durationMs).toBeDefined();
        expect(ts.durationMs).toBeGreaterThanOrEqual(0);
      }

      // Causal depth: tool.call.start events should have depth > 0 (they have parents)
      for (const ts of toolStarts) {
        expect(ts.depth).toBeGreaterThan(0);
      }

      // ── Query: run details ──
      const runRes = await queryGetRaw(`/v1/runs/${runId}`);
      expect(runRes.statusCode).toBe(200);
      const runBody = (runRes.json() as ApiEnvelope<RunResponse>).data;
      expect(runBody.status).toBe('success');
      expect(runBody.summary!.eventCount).toBeGreaterThanOrEqual(8);
    });
  });

  // =========================================================================
  // 3. Error run — tool errors and fatal run errors
  // =========================================================================
  describe('error run: fatal run error flow', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('SDK sends error events → query timeline reflects error state', async () => {
      const runTracer = client.startRun({
        runName: 'error-run-integration',
        triggerSource: 'api',
        sourceAgent: 'error-agent',
      });
      const runId = runTracer.runId;
      await tick(50);

      // Prompt input
      await runTracer.logPrompt({
        role: 'user',
        content: 'Execute a dangerous operation',
        tokenCount: 6,
      });

      // Tool call that fails
      const toolStart = await runTracer.logToolCall(
        { toolName: 'danger-tool', inputParameters: { action: 'delete-all' } },
      );

      await runTracer.logToolCallError(
        {
          toolName: 'danger-tool',
          errorType: 'PermissionDenied',
          errorMessage: 'Insufficient permissions to execute dangerous operation',
        },
        toolStart.eventId,
      );

      // Fatal run error
      await runTracer.logError({
        errorType: 'ToolExecutionFailed',
        errorMessage: 'Critical tool failure caused run to abort',
        fatal: true,
      });

      // End run with failure status
      await runTracer.end('failure', {
        durationMs: 800,
        summary: 'Run failed due to tool error',
      });

      // ── Query: timeline ──
      const timelineRes = await queryGetRaw(`/v1/runs/${runId}/timeline`);
      expect(timelineRes.statusCode).toBe(200);

      const timeline = (timelineRes.json() as ApiEnvelope<TimelineResponse>).data;

      expect(timeline.summary.hasErrors).toBe(true);
      expect(timeline.summary.status).toBe('failure');
      expect(timeline.gaps).toHaveLength(0);

      // Both tool.call.error and run.error should be present
      const errorTypes = timeline.entries
        .filter(
          (e) =>
            e.event.type === 'run.error' ||
            e.event.type === 'tool.call.error',
        )
        .map((e) => e.event.type);
      expect(errorTypes).toContain('tool.call.error');
      expect(errorTypes).toContain('run.error');

      // ── Query: run status ──
      const runRes = await queryGetRaw(`/v1/runs/${runId}`);
      const runData = (runRes.json() as ApiEnvelope<RunResponse>).data;
      expect(runData.status).toBe('failure');
    });
  });

  // =========================================================================
  // 4. Batch ingestion via SDK
  // =========================================================================
  describe('batch event ingestion through SDK', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('SDK sendBatch sends multiple events and they are all persisted', async () => {
      const runId = crypto.randomUUID();
      const tenantId = 'tenant-integ-001';
      const baseTs = '2026-03-22T10:00:00.000Z';

      const events = [
        {
          id: crypto.randomUUID(),
          runId,
          type: 'run.start',
          timestamp: baseTs,
          sequence: 1,
          tenantId,
          sourceAgent: 'batch-agent',
          payload: { runName: 'batch-test' },
          schemaVersion: '1.0.0',
        },
        {
          id: crypto.randomUUID(),
          runId,
          type: 'prompt.input',
          timestamp: new Date(Date.parse(baseTs) + 1000).toISOString(),
          sequence: 2,
          tenantId,
          sourceAgent: 'batch-agent',
          payload: { role: 'user', content: 'Hello batch' },
          schemaVersion: '1.0.0',
        },
        {
          id: crypto.randomUUID(),
          runId,
          type: 'prompt.output',
          timestamp: new Date(Date.parse(baseTs) + 2000).toISOString(),
          sequence: 3,
          tenantId,
          sourceAgent: 'batch-agent',
          payload: { content: 'Batch response', finishReason: 'stop' },
          schemaVersion: '1.0.0',
        },
        {
          id: crypto.randomUUID(),
          runId,
          type: 'run.end',
          timestamp: new Date(Date.parse(baseTs) + 3000).toISOString(),
          sequence: 4,
          tenantId,
          sourceAgent: 'batch-agent',
          payload: { status: 'success', durationMs: 3000 },
          schemaVersion: '1.0.0',
        },
      ];

      const batchResult = await client.sendBatch(events);
      expect(batchResult.results).toHaveLength(4);
      expect(batchResult.errors).toHaveLength(0);

      // Query the events
      const eventsRes = await queryGetRaw(`/v1/runs/${runId}/events`);
      expect(eventsRes.statusCode).toBe(200);

      const eventsBody = eventsRes.json() as ApiEnvelope<EventResponse[]>;
      expect(eventsBody.data).toHaveLength(4);

      // Timeline should be correct
      const timelineRes = await queryGetRaw(`/v1/runs/${runId}/timeline`);
      expect(timelineRes.statusCode).toBe(200);

      const timeline = (timelineRes.json() as ApiEnvelope<TimelineResponse>).data;
      expect(timeline.entries).toHaveLength(4);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.status).toBe('success');
    });
  });

  // =========================================================================
  // 5. Idempotency — duplicate events from SDK
  // =========================================================================
  describe('SDK idempotent ingestion', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('re-sending the same event returns duplicate and does not create extra rows', async () => {
      const runId = crypto.randomUUID();
      const eventId = crypto.randomUUID();

      const event = {
        id: eventId,
        runId,
        type: 'run.start',
        timestamp: '2026-03-22T11:00:00.000Z',
        tenantId: 'tenant-integ-001',
        sourceAgent: 'dedup-agent',
        payload: { runName: 'dedup-test' },
        schemaVersion: '1.0.0',
      };

      // First send — should be created
      const first = await client.sendEvent(event);
      expect(first.status).toBe('created');

      // Second send of same event — should be duplicate
      const second = await client.sendEvent(event);
      expect(second.status).toBe('duplicate');

      // Query should only show 1 event
      const eventsRes = await queryGetRaw(`/v1/runs/${runId}/events`);
      const eventsBody = eventsRes.json() as ApiEnvelope<EventResponse[]>;
      expect(eventsBody.data).toHaveLength(1);
    });
  });

  // =========================================================================
  // 6. Cross-run isolation — two SDK runs don't interfere
  // =========================================================================
  describe('cross-run isolation', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('two separate SDK runs produce independent timelines', async () => {
      // Run 1: simple success
      const run1 = client.startRun({
        runName: 'cross-run-1',
        triggerSource: 'api',
        sourceAgent: 'agent-1',
      });
      await tick(50);
      await run1.logPrompt({ role: 'user', content: 'Hello run 1' });
      await run1.end('success');

      // Run 2: separate run
      const run2 = client.startRun({
        runName: 'cross-run-2',
        triggerSource: 'api',
        sourceAgent: 'agent-2',
      });
      await tick(50);
      await run2.logPrompt({ role: 'user', content: 'Hello run 2' });
      await run2.logToolCall({ toolName: 'search', inputParameters: { q: 'test' } });
      await run2.end('success');

      // Query: list runs should contain both
      const listRes = await queryGetRaw('/v1/runs');
      const listBody = listRes.json() as ApiEnvelope<RunResponse[]>;
      const runIds = listBody.data.map((r) => r.id);
      expect(runIds).toContain(run1.runId);
      expect(runIds).toContain(run2.runId);

      // Timeline for run 1
      const t1Res = await queryGetRaw(`/v1/runs/${run1.runId}/timeline`);
      const t1 = (t1Res.json() as ApiEnvelope<TimelineResponse>).data;
      expect(t1.summary.runId).toBe(run1.runId);
      expect(t1.summary.toolCount).toBe(0);

      // Timeline for run 2
      const t2Res = await queryGetRaw(`/v1/runs/${run2.runId}/timeline`);
      const t2 = (t2Res.json() as ApiEnvelope<TimelineResponse>).data;
      expect(t2.summary.runId).toBe(run2.runId);
      expect(t2.summary.toolCount).toBe(1); // search tool

      // Run 1 events don't appear in run 2's timeline
      const t1EventIds = new Set(t1.entries.map((e) => e.event.id));
      const t2EventIds = new Set(t2.entries.map((e) => e.event.id));
      for (const eid of t1EventIds) {
        expect(t2EventIds.has(eid)).toBe(false);
      }
    });
  });

  // =========================================================================
  // 7. Query service filters work end-to-end
  // =========================================================================
  describe('query service filtering', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('filters runs by status', async () => {
      // Create a successful run
      const successRun = client.startRun({
        runName: 'filter-success',
        triggerSource: 'api',
        sourceAgent: 'filter-agent',
      });
      await tick(50);
      await successRun.end('success');

      // Create a failed run
      const failRun = client.startRun({
        runName: 'filter-fail',
        triggerSource: 'api',
        sourceAgent: 'filter-agent',
      });
      await tick(50);
      await failRun.logError({
        errorType: 'TestError',
        errorMessage: 'Intentional failure for filtering test',
        fatal: true,
      });
      await failRun.end('failure');

      // Filter for failures only
      const failRes = await queryGetRaw('/v1/runs?status=failure');
      const failBody = failRes.json() as ApiEnvelope<RunResponse[]>;
      expect(failBody.data.length).toBeGreaterThanOrEqual(1);
      failBody.data.forEach((r) => expect(r.status).toBe('failure'));

      // Filter for successes only
      const successRes = await queryGetRaw('/v1/runs?status=success');
      const successBody = successRes.json() as ApiEnvelope<RunResponse[]>;
      expect(successBody.data.length).toBeGreaterThanOrEqual(1);
      successBody.data.forEach((r) => expect(r.status).toBe('success'));
    });

    it('filters runs by agentId', async () => {
      const run = client.startRun({
        runName: 'agent-filter-test',
        triggerSource: 'api',
        sourceAgent: 'unique-agent-xyz',
      });
      await tick(50);
      await run.end('success');

      const res = await queryGetRaw('/v1/runs?agentId=unique-agent-xyz');
      const body = res.json() as ApiEnvelope<RunResponse[]>;
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      body.data.forEach((r) => expect(r.agentId).toBe('unique-agent-xyz'));
    });
  });

  // =========================================================================
  // 8. Query service error handling
  // =========================================================================
  describe('query service error cases', () => {
    it('returns 404 for non-existent run', async () => {
      const fakeRunId = '00000000-0000-4000-8000-000000000099';
      const res = await queryGetRaw(`/v1/runs/${fakeRunId}`);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RUN_NOT_FOUND');
    });

    it('returns 404 for events of non-existent run', async () => {
      const fakeRunId = '00000000-0000-4000-8000-000000000099';
      const res = await queryGetRaw(`/v1/runs/${fakeRunId}/events`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for timeline of non-existent run', async () => {
      const fakeRunId = '00000000-0000-4000-8000-000000000099';
      const res = await queryGetRaw(`/v1/runs/${fakeRunId}/timeline`);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for invalid run ID format', async () => {
      const res = await queryGetRaw('/v1/runs/not-a-uuid');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_RUN_ID');
    });

    it('returns 400 for invalid query parameters', async () => {
      const res = await queryGetRaw('/v1/runs?status=bogus');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('INVALID_QUERY_PARAMS');
    });
  });

  // =========================================================================
  // 9. Ingest API validation — rejected events via SDK transport
  // =========================================================================
  describe('ingest API rejects invalid events', () => {
    it('returns 400 for event with missing required fields', async () => {
      const transport = createFastifyTransport(ingestApp);
      const res = await transport('http://localhost:3001/v1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'run.start' }), // missing id, runId, etc.
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>)?.['error']).toBeDefined();
    });

    it('returns 400 for empty batch', async () => {
      const transport = createFastifyTransport(ingestApp);
      const res = await transport('http://localhost:3001/v1/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 10. SDK RunTracer lifecycle enforcement
  // =========================================================================
  describe('RunTracer lifecycle', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('RunTracer rejects events after end() is called', async () => {
      const runTracer = client.startRun({
        runName: 'lifecycle-test',
        triggerSource: 'api',
        sourceAgent: 'lifecycle-agent',
      });
      await tick(50);
      await runTracer.end('success');

      expect(runTracer.isEnded).toBe(true);

      await expect(
        runTracer.logPrompt({ role: 'user', content: 'too late' }),
      ).rejects.toThrow('cannot emit events after run has ended');
    });

    it('RunTracer rejects double end()', async () => {
      const runTracer = client.startRun({
        runName: 'double-end-test',
        triggerSource: 'api',
        sourceAgent: 'lifecycle-agent',
      });
      await tick(50);
      await runTracer.end('success');

      await expect(runTracer.end('failure')).rejects.toThrow('run has already ended');
    });
  });

  // =========================================================================
  // 11. Payload round-trip integrity through all layers
  // =========================================================================
  describe('payload integrity through SDK → ingest → query', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('complex payloads survive the full round-trip', async () => {
      const runTracer = client.startRun({
        runName: 'payload-integrity-test',
        triggerSource: 'api',
        sourceAgent: 'payload-agent',
        sourceFramework: 'custom-framework',
        tags: ['payload-test', 'round-trip'],
        configuration: { model: 'gpt-4', temperature: 0.7, maxTokens: 4096 },
      });
      const runId = runTracer.runId;
      await tick(50);

      // Tool call with complex input parameters
      const toolStartResult = await runTracer.logToolCall({
        toolName: 'complex-api-tool',
        inputParameters: {
          url: 'https://api.example.com/data',
          method: 'POST',
          headers: { 'Authorization': 'Bearer token123', 'X-Custom': 'value' },
          body: {
            nested: { deep: { value: 42 } },
            list: [1, 'two', { three: true }],
            emptyObj: {},
            nullVal: null,
          },
        },
      });

      await runTracer.logToolCallEnd({
        toolName: 'complex-api-tool',
        output: {
          statusCode: 200,
          responseBody: { results: [{ id: 1, name: 'item-1' }], total: 100 },
        },
        durationMs: 500,
        success: true,
      }, toolStartResult.eventId);

      await runTracer.end('success', { durationMs: 1000 });

      // Query the events and verify payload integrity
      const eventsRes = await queryGetRaw(`/v1/runs/${runId}/events`);
      const events = (eventsRes.json() as ApiEnvelope<EventResponse[]>).data;

      const toolStart = events.find((e) => e.type === 'tool.call.start')!;
      expect(toolStart).toBeDefined();
      expect(toolStart.payload['toolName']).toBe('complex-api-tool');

      const inputParams = toolStart.payload['inputParameters'] as Record<string, unknown>;
      expect(inputParams['url']).toBe('https://api.example.com/data');
      expect(inputParams['method']).toBe('POST');
      expect((inputParams['body'] as Record<string, unknown>)?.['nested']).toEqual({ deep: { value: 42 } });
      expect((inputParams['body'] as Record<string, unknown>)?.['list']).toEqual([1, 'two', { three: true }]);
      expect((inputParams['body'] as Record<string, unknown>)?.['nullVal']).toBeNull();

      const toolEnd = events.find((e) => e.type === 'tool.call.end')!;
      expect(toolEnd).toBeDefined();
      const output = toolEnd.payload['output'] as Record<string, unknown>;
      expect(output['statusCode']).toBe(200);
      expect((output['responseBody'] as Record<string, unknown>)?.['total']).toBe(100);
    });
  });

  // =========================================================================
  // 12. Annotation and custom events through SDK
  // =========================================================================
  describe('annotation and custom events', () => {
    let client: TraceReplayClient;

    beforeEach(() => {
      client = createSdkClient();
    });

    afterEach(() => {
      client?.destroy();
    });

    it('SDK annotation and custom events appear in query results and timeline', async () => {
      const runTracer = client.startRun({
        runName: 'annotation-custom-test',
        triggerSource: 'user',
        sourceAgent: 'annotation-agent',
      });
      const runId = runTracer.runId;
      await tick(50);

      // Annotation event
      await runTracer.logAnnotation({
        key: 'reviewer',
        value: 'quality-team',
        annotatedBy: 'human-reviewer',
      });

      // Custom event
      await runTracer.logCustom({
        customType: 'user-feedback',
        rating: 5,
        comment: 'Excellent response quality',
      });

      await runTracer.end('success');

      // Query events
      const eventsRes = await queryGetRaw(`/v1/runs/${runId}/events`);
      const events = (eventsRes.json() as ApiEnvelope<EventResponse[]>).data;
      const types = events.map((e) => e.type);
      expect(types).toContain('annotation');
      expect(types).toContain('custom');

      // Verify annotation payload
      const annotation = events.find((e) => e.type === 'annotation')!;
      expect(annotation.payload['key']).toBe('reviewer');
      expect(annotation.payload['value']).toBe('quality-team');

      // Verify custom event payload
      const custom = events.find((e) => e.type === 'custom')!;
      expect(custom.payload['customType']).toBe('user-feedback');
      expect(custom.payload['rating']).toBe(5);

      // Timeline includes these events
      const timelineRes = await queryGetRaw(`/v1/runs/${runId}/timeline`);
      const timeline = (timelineRes.json() as ApiEnvelope<TimelineResponse>).data;
      const timelineTypes = timeline.entries.map((e) => e.event.type);
      expect(timelineTypes).toContain('annotation');
      expect(timelineTypes).toContain('custom');
    });
  });

  // =========================================================================
  // 13. Health check endpoints
  // =========================================================================
  describe('service health checks', () => {
    it('ingest-api /healthz returns ok', async () => {
      const res = await ingestApp.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('query-service /healthz returns ok', async () => {
      const res = await queryApp.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });
  });
});
