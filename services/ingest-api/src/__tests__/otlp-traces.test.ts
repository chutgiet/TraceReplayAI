import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Mock BullMQ — prevent real Redis connections in unit tests
// ---------------------------------------------------------------------------

const mockAddBulk = vi.fn().mockResolvedValue([]);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    addBulk: mockAddBulk,
    add: vi.fn().mockResolvedValue(undefined),
    close: mockClose,
  })),
}));

// Mock ingest-service (imported by ingest route)
vi.mock('../services/ingest-service.js', () => ({
  ingestEvent: vi.fn().mockResolvedValue({ eventId: 'test-id', status: 'created' }),
  ingestEventBatch: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAttribute(key: string, value: unknown): { key: string; value: Record<string, unknown> } {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'number' && Number.isInteger(value)) return { key, value: { intValue: value } };
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}

function makeCopilotTracePayload() {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            makeAttribute('service.name', 'copilot-chat'),
            makeAttribute('service.version', '0.42.0'),
          ],
        },
        scopeSpans: [
          {
            scope: { name: '@opentelemetry/instrumentation-copilot', version: '1.0.0' },
            spans: [
              {
                traceId: 'abcdef1234567890abcdef1234567890',
                spanId: 'aaaa000000000001',
                parentSpanId: '',
                name: 'invoke_agent',
                kind: 1,
                startTimeUnixNano: '1712000000000000000',
                endTimeUnixNano: '1712000005000000000',
                attributes: [
                  makeAttribute('gen_ai.agent.name', 'copilot'),
                ],
                status: { code: 1 },
              },
              {
                traceId: 'abcdef1234567890abcdef1234567890',
                spanId: 'aaaa000000000002',
                parentSpanId: 'aaaa000000000001',
                name: 'chat',
                kind: 3,
                startTimeUnixNano: '1712000000500000000',
                endTimeUnixNano: '1712000002500000000',
                attributes: [
                  makeAttribute('gen_ai.request.model', 'gpt-4o'),
                  makeAttribute('gen_ai.usage.input_tokens', 600),
                  makeAttribute('gen_ai.usage.output_tokens', 400),
                ],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/traces', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Successful ingestion
  // -----------------------------------------------------------------------

  it('accepts a valid OTLP trace and returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.partialSuccess).toBeDefined();
  });

  it('enqueues each span as a separate job', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    expect(mockAddBulk).toHaveBeenCalledTimes(1);
    const jobs = mockAddBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(2); // invoke_agent + chat

    // Verify job structure
    for (const job of jobs) {
      expect(job.name).toBe('normalize');
      expect(job.data.rawEvent).toBeDefined();
      expect(job.data.rawEvent.vendor).toBe('otel-copilot');
      expect(job.data.jobId).toBeDefined();
      expect(job.opts.jobId).toBeDefined();
    }
  });

  it('uses trace ID as runId in raw events', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    const jobs = mockAddBulk.mock.calls[0][0];
    for (const job of jobs) {
      expect(job.data.rawEvent.runId).toBe('abcdef1234567890abcdef1234567890');
    }
  });

  it('uses default tenant ID when header not provided', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    const jobs = mockAddBulk.mock.calls[0][0];
    for (const job of jobs) {
      expect(job.data.rawEvent.tenantId).toBe('org-tracereplay-dev');
    }
  });

  it('uses custom tenant ID from header', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      headers: { 'x-tracereplay-tenant-id': 'my-org-123' },
      payload: makeCopilotTracePayload(),
    });

    const jobs = mockAddBulk.mock.calls[0][0];
    for (const job of jobs) {
      expect(job.data.rawEvent.tenantId).toBe('my-org-123');
    }
  });

  // -----------------------------------------------------------------------
  // Empty / no-op requests
  // -----------------------------------------------------------------------

  it('returns 200 for empty resourceSpans', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: { resourceSpans: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().partialSuccess).toBeDefined();
    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it('returns 200 for empty spans within resource', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: {
        resourceSpans: [
          {
            resource: { attributes: [] },
            scopeSpans: [{ spans: [] }],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it('returns 200 for missing body fields (defaults applied)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Validation errors
  // -----------------------------------------------------------------------

  it('returns 400 for invalid OTLP structure', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: { resourceSpans: 'not-an-array' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_OTLP_REQUEST');
    expect(body.error.requestId).toBeDefined();
  });

  it('returns 400 for span missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [{ name: 'missing-ids' }],
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_OTLP_REQUEST');
  });

  // -----------------------------------------------------------------------
  // Content-type handling
  // -----------------------------------------------------------------------

  it('returns 415 for protobuf content type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      headers: { 'content-type': 'application/x-protobuf' },
      payload: Buffer.from('binary-data'),
    });

    expect(response.statusCode).toBe(415);
    const body = response.json();
    expect(body.error.code).toBe('UNSUPPORTED_CONTENT_TYPE');
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('returns 500 when queue enqueue fails', async () => {
    mockAddBulk.mockRejectedValueOnce(new Error('Redis down'));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('ENQUEUE_FAILED');
  });

  // -----------------------------------------------------------------------
  // Span data preservation
  // -----------------------------------------------------------------------

  it('preserves span attributes in raw event data', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    const jobs = mockAddBulk.mock.calls[0][0];
    const chatJob = jobs.find(
      (j: { data: { rawEvent: { data: Record<string, unknown> } } }) =>
        j.data.rawEvent.data['name'] === 'chat',
    );

    expect(chatJob).toBeDefined();
    const data = chatJob.data.rawEvent.data;
    const attrs = data['attributes'] as Record<string, unknown>;
    expect(attrs['gen_ai.request.model']).toBe('gpt-4o');
    expect(attrs['gen_ai.usage.input_tokens']).toBe(600);
  });

  it('preserves resource attributes in raw event data', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    const jobs = mockAddBulk.mock.calls[0][0];
    const resAttrs = jobs[0].data.rawEvent.data['resourceAttributes'] as Record<string, unknown>;
    expect(resAttrs['service.name']).toBe('copilot-chat');
  });

  it('includes receivedAt timestamp', async () => {
    const before = new Date().toISOString();

    await app.inject({
      method: 'POST',
      url: '/v1/traces',
      payload: makeCopilotTracePayload(),
    });

    const after = new Date().toISOString();
    const jobs = mockAddBulk.mock.calls[0][0];
    const receivedAt = jobs[0].data.rawEvent.receivedAt;

    expect(receivedAt >= before).toBe(true);
    expect(receivedAt <= after).toBe(true);
  });
});
