import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventRow, SearchEventsResult } from '@tracereplay/common';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const NOW = new Date('2026-03-15T10:00:00.000Z');

function makeSearchEventRow(
  overrides: Partial<EventRow & { rank: number; headline: string }> = {},
): EventRow & { rank: number; headline: string } {
  return {
    id: VALID_UUID_2,
    run_id: VALID_UUID,
    tenant_id: 'tenant-abc',
    type: 'prompt.input',
    sequence: 1,
    parent_event_id: null,
    source_agent: 'agent-1',
    source_framework: null,
    payload: { role: 'user', content: 'hello world' },
    raw_meta: null,
    tags: [],
    schema_version: '1.0.0',
    timestamp: NOW,
    received_at: NOW,
    ingestion_order: 1,
    rank: 0.0607927,
    headline: 'prompt.input agent-1 <mark>hello</mark> <mark>world</mark>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchEvents = vi.fn<(...args: unknown[]) => Promise<SearchEventsResult>>();
const mockListRuns = vi.fn();
const mockGetRunById = vi.fn();
const mockGetEventById = vi.fn();
const mockGetEventsByRunId = vi.fn();

vi.mock('@tracereplay/common', () => ({
  searchEvents: (...args: unknown[]) => mockSearchEvents(...args),
  listRuns: (...args: unknown[]) => mockListRuns(...args),
  getRunById: (...args: unknown[]) => mockGetRunById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  getEventsByRunId: (...args: unknown[]) => mockGetEventsByRunId(...args),
  closePool: vi.fn(),
}));

vi.mock('@tracereplay/replay-engine', () => ({
  buildTimeline: vi.fn(),
}));

vi.mock('@tracereplay/redaction', () => ({
  RedactionEngine: vi.fn().mockImplementation(() => ({
    redact: (payload: Record<string, unknown>) => ({
      redactedPayload: payload,
      redactedFields: [],
    }),
  })),
  BUILT_IN_RULES: [],
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/search', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it('returns 400 when q parameter is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search' });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_SEARCH_PARAMS');
  });

  it('returns 400 when q is empty string', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search?q=' });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_SEARCH_PARAMS');
  });

  it('returns 400 when runId is not a valid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&runId=not-a-uuid',
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_SEARCH_PARAMS');
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&limit=200',
    });

    expect(res.statusCode).toBe(400);
  });

  // -----------------------------------------------------------------------
  // Successful search
  // -----------------------------------------------------------------------

  it('returns 200 with empty results when no events match', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=nonexistent',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
    expect(body.meta.totalEstimate).toBe(0);
    expect(body.meta.query).toBe('nonexistent');
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 200 with matching events and metadata', async () => {
    const event = makeSearchEventRow();
    mockSearchEvents.mockResolvedValueOnce({
      events: [event],
      nextCursor: null,
      totalEstimate: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello+world',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(VALID_UUID_2);
    expect(body.data[0].runId).toBe(VALID_UUID);
    expect(body.data[0].type).toBe('prompt.input');
    expect(body.data[0].rank).toBe(0.0607927);
    expect(body.data[0].headline).toContain('<mark>hello</mark>');
    expect(body.meta.count).toBe(1);
    expect(body.meta.totalEstimate).toBe(1);
    expect(body.meta.query).toBe('hello world');
  });

  it('returns nextCursor when more results exist', async () => {
    const event = makeSearchEventRow();
    mockSearchEvents.mockResolvedValueOnce({
      events: [event],
      nextCursor: '0.06:660e8400-e29b-41d4-a716-446655440001',
      totalEstimate: 42,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&limit=1',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.nextCursor).toBe(
      '0.06:660e8400-e29b-41d4-a716-446655440001',
    );
    expect(body.meta.totalEstimate).toBe(42);
  });

  // -----------------------------------------------------------------------
  // Filter pass-through
  // -----------------------------------------------------------------------

  it('passes tenantId filter to searchEvents', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&tenantId=tenant-abc',
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hello',
        tenantId: 'tenant-abc',
      }),
      expect.any(Object),
    );
  });

  it('passes runId filter to searchEvents', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    await app.inject({
      method: 'GET',
      url: `/v1/search?q=hello&runId=${VALID_UUID}`,
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hello',
        runId: VALID_UUID,
      }),
      expect.any(Object),
    );
  });

  it('passes eventTypes filter as array', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&eventTypes=prompt.input,tool.call.start',
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hello',
        eventTypes: ['prompt.input', 'tool.call.start'],
      }),
      expect.any(Object),
    );
  });

  it('passes time range filters', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&after=2026-03-14T00:00:00.000Z&before=2026-03-16T00:00:00.000Z',
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'hello',
        after: new Date('2026-03-14T00:00:00.000Z'),
        before: new Date('2026-03-16T00:00:00.000Z'),
      }),
      expect.any(Object),
    );
  });

  it('passes cursor and limit to pagination', async () => {
    mockSearchEvents.mockResolvedValueOnce({
      events: [],
      nextCursor: null,
      totalEstimate: 0,
    });

    await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello&cursor=0.06:some-uuid&limit=10',
    });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'hello' }),
      expect.objectContaining({ cursor: '0.06:some-uuid', limit: 10 }),
    );
  });

  // -----------------------------------------------------------------------
  // Response format
  // -----------------------------------------------------------------------

  it('formats event timestamps as ISO strings', async () => {
    const event = makeSearchEventRow({
      timestamp: new Date('2026-03-15T12:30:00.000Z'),
      received_at: new Date('2026-03-15T12:30:01.000Z'),
    });
    mockSearchEvents.mockResolvedValueOnce({
      events: [event],
      nextCursor: null,
      totalEstimate: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello',
    });

    const body = res.json();
    expect(body.data[0].timestamp).toBe('2026-03-15T12:30:00.000Z');
    expect(body.data[0].receivedAt).toBe('2026-03-15T12:30:01.000Z');
  });

  it('includes payload in response', async () => {
    const event = makeSearchEventRow({
      payload: { role: 'user', content: 'find the bug' },
    });
    mockSearchEvents.mockResolvedValueOnce({
      events: [event],
      nextCursor: null,
      totalEstimate: 1,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=bug',
    });

    const body = res.json();
    expect(body.data[0].payload.role).toBe('user');
    expect(body.data[0].payload.content).toBe('find the bug');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('returns 500 when searchEvents throws', async () => {
    mockSearchEvents.mockRejectedValueOnce(new Error('DB connection failed'));

    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=hello',
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe('SEARCH_FAILED');
    expect(body.error.requestId).toBeDefined();
  });
});
