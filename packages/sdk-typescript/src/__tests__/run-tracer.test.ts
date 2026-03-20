import { describe, it, expect, vi, afterEach } from 'vitest';
import { TraceReplayClient } from '../client.js';
import { RunTracer } from '../run-tracer.js';
import type { HttpTransport, HttpResponse } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successTransport(): HttpTransport {
  let eventCounter = 0;
  return vi.fn(async () => {
    eventCounter++;
    return {
      status: 201,
      body: { data: { eventId: `e-${eventCounter}`, status: 'created' } },
    } satisfies HttpResponse;
  });
}

function createClientAndTracer(
  transport?: HttpTransport,
): { client: TraceReplayClient; tracer: RunTracer } {
  const t = transport ?? successTransport();
  const client = new TraceReplayClient(
    {
      endpoint: 'https://ingest.test.com',
      tenantId: 'tenant-001',
      flushIntervalMs: 100_000,
      retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 },
    },
    t,
  );
  const tracer = client.startRun({
    sourceAgent: 'test-agent',
    sourceFramework: 'test-framework',
    runName: 'Test Run',
    triggerSource: 'user',
    tags: ['test'],
  });
  return { client, tracer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunTracer', () => {
  let client: TraceReplayClient;

  afterEach(() => {
    client?.destroy();
  });

  describe('construction', () => {
    it('generates a UUID runId', () => {
      const { client: c, tracer } = createClientAndTracer();
      client = c;
      // UUID v4 format: 8-4-4-4-12 hex chars
      expect(tracer.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('emits run.start event on construction', () => {
      const transport = successTransport();
      const { client: c } = createClientAndTracer(transport);
      client = c;

      // The run.start event is fired asynchronously (void), but the transport should be called
      expect(transport).toHaveBeenCalled();
      const [url, options] = (transport as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        { body: string },
      ];
      expect(url).toBe('https://ingest.test.com/v1/events');
      const body = JSON.parse(options.body);
      expect(body.type).toBe('run.start');
      expect(body.payload.runName).toBe('Test Run');
      expect(body.payload.triggerSource).toBe('user');
    });
  });

  describe('logPrompt', () => {
    it('sends a prompt.input event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      const result = await tracer.logPrompt({
        role: 'user',
        content: 'Hello world',
        tokenCount: 3,
      });

      expect(result.status).toBe('created');
      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('prompt.input');
      expect(body.payload.role).toBe('user');
      expect(body.payload.content).toBe('Hello world');
      expect(body.runId).toBe(tracer.runId);
    });
  });

  describe('logPromptOutput', () => {
    it('sends a prompt.output event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logPromptOutput({
        content: 'Response text',
        finishReason: 'stop',
        modelId: 'gpt-4',
      });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('prompt.output');
      expect(body.payload.content).toBe('Response text');
    });
  });

  describe('logToolCall', () => {
    it('sends a tool.call.start event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logToolCall({
        toolName: 'web_search',
        inputParameters: { query: 'test' },
      });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('tool.call.start');
      expect(body.payload.toolName).toBe('web_search');
    });
  });

  describe('logToolCallEnd', () => {
    it('sends a tool.call.end event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logToolCallEnd({
        toolName: 'web_search',
        output: { results: [] },
        success: true,
        durationMs: 150,
      });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('tool.call.end');
      expect(body.payload.success).toBe(true);
    });
  });

  describe('logToolCallError', () => {
    it('sends a tool.call.error event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logToolCallError({
        toolName: 'web_search',
        errorType: 'TimeoutError',
        errorMessage: 'Request timed out',
      });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('tool.call.error');
    });
  });

  describe('logError', () => {
    it('sends a run.error event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logError({
        errorType: 'RuntimeError',
        errorMessage: 'Something went wrong',
        fatal: false,
      });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('run.error');
      expect(body.payload.fatal).toBe(false);
    });
  });

  describe('logCustom', () => {
    it('sends a custom event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logCustom({ customType: 'metric', value: 42 });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('custom');
      expect(body.payload.value).toBe(42);
    });
  });

  describe('logAnnotation', () => {
    it('sends an annotation event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logAnnotation({ key: 'review', value: 'approved', annotatedBy: 'admin' });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('annotation');
      expect(body.payload.key).toBe('review');
    });
  });

  describe('end', () => {
    it('sends a run.end event with default success status', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.end();

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.type).toBe('run.end');
      expect(body.payload.status).toBe('success');
    });

    it('accepts custom status and options', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.end('failure', { durationMs: 1500, summary: 'Failed due to timeout' });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.payload.status).toBe('failure');
      expect(body.payload.durationMs).toBe(1500);
      expect(body.payload.summary).toBe('Failed due to timeout');
    });

    it('prevents double-ending', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.end();
      await expect(tracer.end()).rejects.toThrow('run has already ended');
    });

    it('sets isEnded to true after ending', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      expect(tracer.isEnded).toBe(false);
      await tracer.end();
      expect(tracer.isEnded).toBe(true);
    });

    it('prevents emitting events after end', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.end();
      await expect(
        tracer.logPrompt({ role: 'user', content: 'too late' }),
      ).rejects.toThrow('cannot emit events after run has ended');
    });
  });

  describe('sequence numbering', () => {
    it('increments sequence for each event', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      // Wait for run.start (sequence 0)
      await new Promise((r) => setTimeout(r, 10));

      await tracer.logPrompt({ role: 'user', content: 'a' });
      await tracer.logPrompt({ role: 'assistant', content: 'b' });

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const sequences: number[] = [];
      for (const call of calls) {
        const [, opts] = call as [string, { body: string }];
        const body = JSON.parse(opts.body);
        sequences.push(body.sequence);
      }

      // Should be monotonically increasing
      for (let i = 1; i < sequences.length; i++) {
        expect(sequences[i]).toBeGreaterThan(sequences[i - 1]!);
      }
    });
  });

  describe('parentEventId', () => {
    it('includes parentEventId when provided', async () => {
      const transport = successTransport();
      const { client: c, tracer } = createClientAndTracer(transport);
      client = c;

      await tracer.logToolCall(
        { toolName: 'search', inputParameters: {} },
        'parent-event-123',
      );

      const calls = (transport as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1] as [string, { body: string }];
      const body = JSON.parse(lastCall[1].body);
      expect(body.parentEventId).toBe('parent-event-123');
    });
  });
});
