import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import type { EventType } from '@tracereplay/event-schema';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const VALID_TIMESTAMP = '2026-03-15T10:00:00.000Z';

function makeEvent(
  type: EventType,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: VALID_UUID,
    runId: VALID_UUID_2,
    type,
    timestamp: VALID_TIMESTAMP,
    tenantId: 'tenant-abc',
    sourceAgent: 'test-agent',
    payload,
    schemaVersion: SCHEMA_VERSION,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock the ingest service — we test route-level behaviour here,
// not real DB persistence (that's for integration tests).
// ---------------------------------------------------------------------------

vi.mock('../services/ingest-service.js', () => ({
  ingestEvent: vi.fn().mockResolvedValue({ eventId: '550e8400-e29b-41d4-a716-446655440000', status: 'created' }),
  ingestEventBatch: vi.fn().mockImplementation((events: Array<{ id: string }>) =>
    Promise.resolve(events.map((e) => ({ eventId: e.id, status: 'created' }))),
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/events', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('returns 400 for missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { not: 'an event' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_EVENT_SCHEMA');
    expect(body.error.requestId).toBeDefined();
  });

  it('returns 400 for invalid event type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('not.a.type' as EventType, {}),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_EVENT_SCHEMA');
  });

  it('returns 400 for invalid timestamp', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.start', {}, { timestamp: 'not-a-date' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid UUID id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.start', {}, { id: 'not-uuid' }),
    });

    expect(response.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Successful ingestion
  // -------------------------------------------------------------------------

  it('returns 201 for a valid run.start event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.start', {}),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.eventId).toBe(VALID_UUID);
    expect(body.data.status).toBe('created');
    expect(body.meta.requestId).toBeDefined();
  });

  it('returns 201 for a valid run.end event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.end', { status: 'success' }),
    });

    expect(response.statusCode).toBe(201);
  });

  it('returns 201 for a valid tool.call.start event', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('tool.call.start', {
        toolName: 'search',
        inputParameters: { q: 'test' },
      }),
    });

    expect(response.statusCode).toBe(201);
  });

  it('returns 200 for duplicate event', async () => {
    const { ingestEvent } = await import('../services/ingest-service.js');
    (ingestEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      eventId: VALID_UUID,
      status: 'duplicate',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.start', {}),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('duplicate');
  });

  it('returns 500 when ingest service throws', async () => {
    const { ingestEvent } = await import('../services/ingest-service.js');
    (ingestEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB down'));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: makeEvent('run.start', {}),
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('INGEST_FAILED');
  });
});

// ---------------------------------------------------------------------------
// Batch endpoint
// ---------------------------------------------------------------------------

describe('POST /v1/events/batch', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  it('returns 400 when body is not an array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/batch',
      payload: { not: 'array' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_BATCH');
  });

  it('returns 400 for empty array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/batch',
      payload: [],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('EMPTY_BATCH');
  });

  it('returns 400 when batch exceeds 100 events', async () => {
    const events = Array.from({ length: 101 }, () =>
      makeEvent('run.start', {}, { id: crypto.randomUUID() }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/batch',
      payload: events,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BATCH_TOO_LARGE');
  });

  it('returns 400 when any event in batch is invalid', async () => {
    const events = [
      makeEvent('run.start', {}),
      { not: 'valid' },
    ];

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/batch',
      payload: events,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_BATCH_EVENTS');
    expect(body.error.details).toHaveLength(1);
    expect(body.error.details[0].index).toBe(1);
  });

  it('returns 201 for valid batch', async () => {
    const events = [
      makeEvent('run.start', {}, { id: crypto.randomUUID() }),
      makeEvent('run.end', { status: 'success' }, { id: crypto.randomUUID() }),
    ];

    const response = await app.inject({
      method: 'POST',
      url: '/v1/events/batch',
      payload: events,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /healthz', () => {
  it('returns 200', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
