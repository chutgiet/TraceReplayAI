import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunRow, EventRow, ListRunsResult } from '@tracereplay/common';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date('2026-03-15T10:00:00.000Z');

function makeRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: VALID_UUID,
    tenant_id: 'tenant-abc',
    agent_id: 'agent-1',
    run_name: 'test-run',
    trigger_source: 'api',
    parent_run_id: null,
    status: 'success',
    started_at: NOW,
    ended_at: new Date('2026-03-15T10:05:00.000Z'),
    tags: ['test'],
    metadata: null,
    schema_version: '1.0.0',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeEventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: VALID_UUID_2,
    run_id: VALID_UUID,
    tenant_id: 'tenant-abc',
    type: 'run.start',
    sequence: 1,
    parent_event_id: null,
    source_agent: 'agent-1',
    source_framework: null,
    payload: {},
    raw_meta: null,
    tags: [],
    schema_version: '1.0.0',
    timestamp: NOW,
    received_at: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock the DB layer
// ---------------------------------------------------------------------------

const mockListRuns = vi.fn<() => Promise<ListRunsResult>>();
const mockGetRunById = vi.fn<() => Promise<RunRow | null>>();
const mockGetEventsByRunId = vi.fn<() => Promise<EventRow[]>>();

vi.mock('@tracereplay/common', () => ({
  listRuns: (...args: unknown[]) => mockListRuns(...args),
  getRunById: (...args: unknown[]) => mockGetRunById(...args),
  getEventsByRunId: (...args: unknown[]) => mockGetEventsByRunId(...args),
  closePool: vi.fn(),
}));

// ---------------------------------------------------------------------------
// GET /v1/runs
// ---------------------------------------------------------------------------

describe('GET /v1/runs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it('returns 200 with empty list when no runs exist', async () => {
    mockListRuns.mockResolvedValueOnce({ runs: [], nextCursor: null });

    const res = await app.inject({ method: 'GET', url: '/v1/runs' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.nextCursor).toBeNull();
    expect(body.meta.count).toBe(0);
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 200 with runs data', async () => {
    const run = makeRunRow();
    mockListRuns.mockResolvedValueOnce({ runs: [run], nextCursor: null });

    const res = await app.inject({ method: 'GET', url: '/v1/runs' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(VALID_UUID);
    expect(body.data[0].tenantId).toBe('tenant-abc');
    expect(body.data[0].agentId).toBe('agent-1');
    expect(body.data[0].status).toBe('success');
    expect(body.data[0].startedAt).toBe('2026-03-15T10:00:00.000Z');
    expect(body.data[0].endedAt).toBe('2026-03-15T10:05:00.000Z');
  });

  it('passes filter parameters to listRuns', async () => {
    mockListRuns.mockResolvedValueOnce({ runs: [], nextCursor: null });

    await app.inject({
      method: 'GET',
      url: '/v1/runs?status=running&agentId=agent-1&tenantId=tenant-abc',
    });

    expect(mockListRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        agentId: 'agent-1',
        tenantId: 'tenant-abc',
      }),
      expect.any(Object),
    );
  });

  it('passes cursor and limit to listRuns', async () => {
    mockListRuns.mockResolvedValueOnce({ runs: [], nextCursor: null });

    await app.inject({
      method: 'GET',
      url: '/v1/runs?cursor=2026-03-15T10:00:00.000Z&limit=5',
    });

    expect(mockListRuns).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        cursor: '2026-03-15T10:00:00.000Z',
        limit: 5,
      }),
    );
  });

  it('returns nextCursor when more pages exist', async () => {
    const run = makeRunRow();
    mockListRuns.mockResolvedValueOnce({
      runs: [run],
      nextCursor: '2026-03-15T09:00:00.000Z',
    });

    const res = await app.inject({ method: 'GET', url: '/v1/runs?limit=1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().meta.nextCursor).toBe('2026-03-15T09:00:00.000Z');
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/runs?status=invalid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('returns 400 for invalid limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/runs?limit=999',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('returns 400 for invalid startedAfter date', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/runs?startedAfter=not-a-date',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_QUERY_PARAMS');
  });

  it('returns 500 when listRuns throws', async () => {
    mockListRuns.mockRejectedValueOnce(new Error('DB down'));

    const res = await app.inject({ method: 'GET', url: '/v1/runs' });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('QUERY_FAILED');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/runs/:runId
// ---------------------------------------------------------------------------

describe('GET /v1/runs/:runId', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it('returns 200 with run details and summary', async () => {
    const run = makeRunRow();
    const events = [
      makeEventRow({ type: 'run.start', sequence: 1 }),
      makeEventRow({ id: '770e8400-e29b-41d4-a716-446655440002', type: 'prompt.input', sequence: 2 }),
      makeEventRow({ id: '880e8400-e29b-41d4-a716-446655440003', type: 'run.end', sequence: 3 }),
    ];
    mockGetRunById.mockResolvedValueOnce(run);
    mockGetEventsByRunId.mockResolvedValueOnce(events);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe(VALID_UUID);
    expect(body.data.summary).toBeDefined();
    expect(body.data.summary.eventCount).toBe(3);
    expect(body.data.summary.durationMs).toBe(300_000); // 5 minutes
    expect(body.data.summary.status).toBe('success');
  });

  it('returns 404 for nonexistent run', async () => {
    mockGetRunById.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RUN_NOT_FOUND');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/runs/not-a-uuid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_RUN_ID');
  });

  it('returns null durationMs for running run', async () => {
    const run = makeRunRow({ status: 'running', ended_at: null });
    mockGetRunById.mockResolvedValueOnce(run);
    mockGetEventsByRunId.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.summary.durationMs).toBeNull();
  });

  it('returns 500 when DB throws', async () => {
    mockGetRunById.mockRejectedValueOnce(new Error('DB down'));

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}`,
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('QUERY_FAILED');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/runs/:runId/events
// ---------------------------------------------------------------------------

describe('GET /v1/runs/:runId/events', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it('returns 200 with ordered events', async () => {
    const run = makeRunRow();
    const events = [
      makeEventRow({ type: 'run.start', sequence: 1 }),
      makeEventRow({
        id: '770e8400-e29b-41d4-a716-446655440002',
        type: 'tool.call.start',
        sequence: 2,
        payload: { toolName: 'search', inputParameters: { q: 'test' } },
      }),
    ];
    mockGetRunById.mockResolvedValueOnce(run);
    mockGetEventsByRunId.mockResolvedValueOnce(events);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}/events`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].type).toBe('run.start');
    expect(body.data[1].type).toBe('tool.call.start');
    expect(body.meta.count).toBe(2);
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 404 for nonexistent run', async () => {
    mockGetRunById.mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}/events`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('RUN_NOT_FOUND');
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/runs/not-a-uuid/events',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_RUN_ID');
  });

  it('returns empty array for run with no events', async () => {
    mockGetRunById.mockResolvedValueOnce(makeRunRow());
    mockGetEventsByRunId.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}/events`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().meta.count).toBe(0);
  });

  it('formats event timestamps as ISO strings', async () => {
    mockGetRunById.mockResolvedValueOnce(makeRunRow());
    mockGetEventsByRunId.mockResolvedValueOnce([makeEventRow()]);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}/events`,
    });

    expect(res.statusCode).toBe(200);
    const event = res.json().data[0];
    expect(event.timestamp).toBe('2026-03-15T10:00:00.000Z');
    expect(event.receivedAt).toBe('2026-03-15T10:00:00.000Z');
  });

  it('returns 500 when DB throws', async () => {
    mockGetRunById.mockRejectedValueOnce(new Error('DB down'));

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${VALID_UUID}/events`,
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('QUERY_FAILED');
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /healthz', () => {
  it('returns 200 ok', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
