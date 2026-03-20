import { describe, it, expect, vi, afterEach } from 'vitest';
import { TraceReplayClient } from '../client.js';
import type { HttpTransport, HttpResponse, ClientConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransport(responses: HttpResponse[]): HttpTransport {
  let callIndex = 0;
  return vi.fn(async () => {
    const response = responses[callIndex];
    if (!response) {
      throw new Error('fetch failed');
    }
    callIndex++;
    return response;
  });
}

function createClient(
  transport: HttpTransport,
  overrides?: Partial<ClientConfig>,
): TraceReplayClient {
  return new TraceReplayClient(
    {
      endpoint: 'https://ingest.test.com',
      tenantId: 'tenant-001',
      flushIntervalMs: 100_000, // high so it doesn't auto-flush during tests
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 10 },
      ...overrides,
    },
    transport,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceReplayClient', () => {
  let client: TraceReplayClient;

  afterEach(() => {
    client?.destroy();
  });

  describe('constructor', () => {
    it('throws if endpoint is missing', () => {
      expect(() => new TraceReplayClient({ endpoint: '', tenantId: 'a' })).toThrow(
        'endpoint is required',
      );
    });

    it('throws if tenantId is missing', () => {
      expect(() => new TraceReplayClient({ endpoint: 'http://x', tenantId: '' })).toThrow(
        'tenantId is required',
      );
    });
  });

  describe('sendEvent', () => {
    it('sends an event and returns created result', async () => {
      const transport = mockTransport([
        { status: 201, body: { data: { eventId: 'e-1', status: 'created' } } },
      ]);
      client = createClient(transport);

      const result = await client.sendEvent({
        id: 'e-1',
        runId: 'r-1',
        type: 'run.start',
        timestamp: new Date().toISOString(),
        tenantId: 'tenant-001',
        sourceAgent: 'agent-1',
        payload: {},
        schemaVersion: '1.0.0',
      });

      expect(result.status).toBe('created');
      expect(result.eventId).toBe('e-1');
      expect(transport).toHaveBeenCalledOnce();
    });

    it('returns duplicate status from ingest API', async () => {
      const transport = mockTransport([
        { status: 200, body: { data: { eventId: 'e-1', status: 'duplicate' } } },
      ]);
      client = createClient(transport);

      const result = await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
      expect(result.status).toBe('duplicate');
    });

    it('buffers event on network error', async () => {
      const transport = vi.fn(async () => {
        throw new Error('fetch failed');
      }) as HttpTransport;
      client = createClient(transport, {
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      });

      const result = await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
      expect(result.status).toBe('buffered');
      expect(client.bufferedCount).toBe(1);
    });

    it('throws on 400 client error', async () => {
      const transport = mockTransport([
        { status: 400, body: { error: { code: 'INVALID_EVENT_SCHEMA' } } },
      ]);
      client = createClient(transport);

      await expect(
        client.sendEvent({ id: 'e-1' } as Record<string, unknown>),
      ).rejects.toThrow('Ingest API returned 400');
    });

    it('validates event before send when validateBeforeSend is true', async () => {
      const transport = mockTransport([]);
      client = createClient(transport, { validateBeforeSend: true });

      await expect(
        client.sendEvent({ bad: 'data' } as unknown as Record<string, unknown>),
      ).rejects.toThrow('validation failed');
    });
  });

  describe('sendBatch', () => {
    it('sends a batch and returns results', async () => {
      const transport = mockTransport([
        {
          status: 201,
          body: {
            data: {
              results: [
                { eventId: 'e-1', status: 'created' },
                { eventId: 'e-2', status: 'created' },
              ],
            },
          },
        },
      ]);
      client = createClient(transport);

      const result = await client.sendBatch([
        { id: 'e-1' } as Record<string, unknown>,
        { id: 'e-2' } as Record<string, unknown>,
      ]);

      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('returns empty result for empty batch', async () => {
      const transport = mockTransport([]);
      client = createClient(transport);

      const result = await client.sendBatch([]);
      expect(result.results).toHaveLength(0);
      expect(transport).not.toHaveBeenCalled();
    });

    it('buffers all events on network error', async () => {
      const transport = vi.fn(async () => {
        throw new Error('fetch failed');
      }) as HttpTransport;
      client = createClient(transport, {
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      });

      const result = await client.sendBatch([
        { id: 'e-1' } as Record<string, unknown>,
        { id: 'e-2' } as Record<string, unknown>,
      ]);

      expect(result.results.every((r) => r.status === 'buffered')).toBe(true);
      expect(client.bufferedCount).toBe(2);
    });
  });

  describe('offline buffer', () => {
    it('respects maxBufferSize by dropping oldest events', async () => {
      const transport = vi.fn(async () => {
        throw new Error('fetch failed');
      }) as HttpTransport;
      client = createClient(transport, {
        maxBufferSize: 2,
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      });

      await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
      await client.sendEvent({ id: 'e-2' } as Record<string, unknown>);
      await client.sendEvent({ id: 'e-3' } as Record<string, unknown>);

      expect(client.bufferedCount).toBe(2);
    });

    it('flushes buffer when endpoint becomes available', async () => {
      let callCount = 0;
      const transport = vi.fn(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls fail (initial send attempts)
          throw new Error('fetch failed');
        }
        // Subsequent calls succeed (flush)
        return { status: 201, body: { data: { results: [] } } };
      }) as HttpTransport;

      client = createClient(transport, {
        retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
      });

      // These will be buffered
      await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
      await client.sendEvent({ id: 'e-2' } as Record<string, unknown>);
      expect(client.bufferedCount).toBe(2);

      // Manually flush — now transport succeeds
      const flushed = await client.flush();
      expect(flushed).toBe(2);
      expect(client.bufferedCount).toBe(0);
    });
  });

  describe('startRun', () => {
    it('creates a RunTracer with a generated runId', () => {
      const transport = mockTransport([
        { status: 201, body: { data: { eventId: 'e-1', status: 'created' } } },
      ]);
      client = createClient(transport);

      const tracer = client.startRun({ sourceAgent: 'test-agent' });
      expect(tracer.runId).toBeTruthy();
      expect(typeof tracer.runId).toBe('string');
    });
  });

  describe('buildEvent', () => {
    it('produces an event with required fields', () => {
      const transport = mockTransport([]);
      client = createClient(transport);

      const event = client.buildEvent('run.start', 'run-1', 'agent-1', { runName: 'test' });

      expect(event).toMatchObject({
        runId: 'run-1',
        type: 'run.start',
        tenantId: 'tenant-001',
        sourceAgent: 'agent-1',
        payload: { runName: 'test' },
        schemaVersion: '1.0.0',
      });
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
    });
  });

  describe('headers', () => {
    it('includes Authorization header when apiKey is set', async () => {
      const transport = vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
        expect(opts.headers['Authorization']).toBe('Bearer sk-test');
        return { status: 201, body: { data: { eventId: 'e-1', status: 'created' } } };
      }) as unknown as HttpTransport;

      client = createClient(transport, { apiKey: 'sk-test' });
      await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
    });

    it('omits Authorization header when apiKey is not set', async () => {
      const transport = vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
        expect(opts.headers['Authorization']).toBeUndefined();
        return { status: 201, body: { data: { eventId: 'e-1', status: 'created' } } };
      }) as unknown as HttpTransport;

      client = createClient(transport);
      await client.sendEvent({ id: 'e-1' } as Record<string, unknown>);
    });
  });

  describe('destroy', () => {
    it('can be called multiple times safely', () => {
      const transport = mockTransport([]);
      client = createClient(transport);

      expect(() => {
        client.destroy();
        client.destroy();
      }).not.toThrow();
    });
  });
});
