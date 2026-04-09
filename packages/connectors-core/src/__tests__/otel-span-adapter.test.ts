import { describe, it, expect } from 'vitest';
import { OTelSpanAdapter } from '../otel-span-adapter.js';
import type { RawVendorEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers — build RawVendorEvent matching spanToRawEvent() output shape
// ---------------------------------------------------------------------------

/**
 * Creates a RawVendorEvent with OTel span data, matching the structure
 * produced by `spanToRawEvent()` in the OTLP parser.
 */
function makeOtelRaw(
  name: string,
  opts: {
    vendor?: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    startTimeUnixNano?: string;
    endTimeUnixNano?: string;
    startTime?: string;
    endTime?: string;
    kind?: number;
    attributes?: Record<string, unknown>;
    resourceAttributes?: Record<string, unknown>;
    status?: { code?: number; message?: string };
    events?: Array<{ name: string; timeUnixNano: string; attributes: Record<string, unknown> }>;
    links?: Array<{ traceId: string; spanId: string; attributes: Record<string, unknown> }>;
    scopeName?: string;
    scopeVersion?: string;
    tenantId?: string;
    runId?: string;
    receivedAt?: string;
  } = {},
): RawVendorEvent {
  const {
    vendor = 'otel-copilot',
    traceId = 'abc123def456abc123def456abc12345',
    spanId = 'span-001-uuid-0001',
    parentSpanId = '',
    startTimeUnixNano = '1712000000000000000',
    endTimeUnixNano = '1712000005000000000',
    startTime = '2024-04-01T20:00:00.000Z',
    endTime = '2024-04-01T20:00:05.000Z',
    kind = 1,
    attributes = {},
    resourceAttributes = { 'service.name': 'copilot-chat' },
    status = { code: 1 },
    events: spanEvents = [],
    links = [],
    scopeName = '@opentelemetry/instrumentation-copilot',
    scopeVersion = '1.0.0',
    tenantId = 'tenant-otel-001',
    runId,
    receivedAt = '2024-04-01T20:00:06.000Z',
  } = opts;

  return {
    vendor,
    tenantId,
    receivedAt,
    ...(runId ? { runId } : {}),
    data: {
      traceId,
      spanId,
      parentSpanId,
      name,
      kind,
      startTimeUnixNano,
      endTimeUnixNano,
      startTime,
      endTime,
      attributes,
      resourceAttributes,
      status,
      events: spanEvents,
      links,
      scopeName,
      scopeVersion,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OTelSpanAdapter', () => {
  const adapter = new OTelSpanAdapter();

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------
  describe('vendorId & displayName', () => {
    it('has vendorId "otel-genai"', () => {
      expect(adapter.vendorId).toBe('otel-genai');
    });

    it('has displayName "OpenTelemetry GenAI"', () => {
      expect(adapter.displayName).toBe('OpenTelemetry GenAI');
    });
  });

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------
  describe('canHandle', () => {
    it('returns true for otel-genai vendor', () => {
      expect(adapter.canHandle(makeOtelRaw('invoke_agent', { vendor: 'otel-genai' }))).toBe(true);
    });

    it('returns true for otel-copilot vendor', () => {
      expect(adapter.canHandle(makeOtelRaw('chat', { vendor: 'otel-copilot' }))).toBe(true);
    });

    it('returns true for otel-codex vendor', () => {
      expect(adapter.canHandle(makeOtelRaw('chat', { vendor: 'otel-codex' }))).toBe(true);
    });

    it('returns true for otel-claude vendor', () => {
      expect(adapter.canHandle(makeOtelRaw('chat', { vendor: 'otel-claude' }))).toBe(true);
    });

    it('returns true for otel-cursor vendor', () => {
      expect(adapter.canHandle(makeOtelRaw('chat', { vendor: 'otel-cursor' }))).toBe(true);
    });

    it('returns true for unknown vendor with OTel span data shape', () => {
      const raw: RawVendorEvent = {
        vendor: 'some-unknown-vendor',
        tenantId: 'tenant-001',
        receivedAt: '2024-04-01T20:00:00.000Z',
        data: {
          name: 'chat',
          traceId: 'abc123',
          spanId: 'def456',
          attributes: { 'gen_ai.request.model': 'gpt-4' },
        },
      };
      expect(adapter.canHandle(raw)).toBe(true);
    });

    it('returns false for non-OTel vendor without span data', () => {
      const raw: RawVendorEvent = {
        vendor: 'github-copilot',
        tenantId: 'tenant-001',
        receivedAt: '2024-04-01T20:00:00.000Z',
        data: { type: 'copilot.session.start' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });

    it('returns false when attributes missing', () => {
      const raw: RawVendorEvent = {
        vendor: 'some-vendor',
        tenantId: 'tenant-001',
        receivedAt: '2024-04-01T20:00:00.000Z',
        data: { name: 'chat', traceId: 'abc', spanId: 'def' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // invoke_agent → run.start + run.end
  // -----------------------------------------------------------------------
  describe('normalize: invoke_agent → run.start + run.end', () => {
    it('produces run.start + run.end for a completed agent span', () => {
      const raw = makeOtelRaw('invoke_agent', {
        attributes: {
          'gen_ai.agent.name': 'copilot-workspace',
          'gen_ai.agent.description': 'Generated PR review',
        },
        resourceAttributes: {
          'service.name': 'copilot-chat',
          'service.version': '1.42.0',
          'session.id': 'session-abc',
        },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.events.length).toBeGreaterThanOrEqual(2);

      const start = result.events.find((e) => e.type === 'run.start')!;
      const end = result.events.find((e) => e.type === 'run.end')!;
      expect(start).toBeDefined();
      expect(end).toBeDefined();

      // run.start payload
      expect(start.type).toBe('run.start');
      expect(start.sourceFramework).toBe('opentelemetry');
      expect(start.sourceAgent).toBe('copilot-workspace');
      expect(start.tenantId).toBe('tenant-otel-001');
      expect(start.tags).toContain('otel-copilot');
      expect(start.tags).toContain('otel');
      expect((start.payload as Record<string, unknown>)['runName']).toBe('copilot-workspace');
      expect((start.payload as Record<string, unknown>)['triggerSource']).toBe('agent');
      expect((start.payload as Record<string, unknown>)['configuration']).toEqual({
        serviceVersion: '1.42.0',
        sessionId: 'session-abc',
        agentDescription: 'Generated PR review',
      });

      // run.end payload
      expect(end.type).toBe('run.end');
      expect((end.payload as Record<string, unknown>)['status']).toBe('success');
      expect((end.payload as Record<string, unknown>)['durationMs']).toBe(5000);
      expect((end.payload as Record<string, unknown>)['summary']).toBe('Generated PR review');

      // run.end.parentEventId links back to start
      expect(end.parentEventId).toBe(start.id);
    });

    it('uses span name as runName when agent name not in attributes', () => {
      const raw = makeOtelRaw('invoke_agent', {
        resourceAttributes: {},
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events.find((e) => e.type === 'run.start')!;
      expect((start.payload as Record<string, unknown>)['runName']).toBe('invoke_agent');
    });

    it('preserves trace context: runId from traceId, eventId from spanId', () => {
      const raw = makeOtelRaw('invoke_agent', {
        traceId: 'aaaa1111bbbb2222cccc3333dddd4444',
        spanId: 'span-id-12345678',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events[0]!;
      expect(start.runId).toBe('aaaa1111bbbb2222cccc3333dddd4444');
      expect(start.id).toBe('span-id-12345678');
    });

    it('maps parentSpanId to parentEventId', () => {
      const raw = makeOtelRaw('invoke_agent', {
        parentSpanId: 'parent-span-001',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events[0]!;
      expect(start.parentEventId).toBe('parent-span-001');
    });

    it('omits parentEventId when parentSpanId is empty', () => {
      const raw = makeOtelRaw('invoke_agent', {
        parentSpanId: '',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events[0]!;
      expect(start.parentEventId).toBeUndefined();
    });

    it('produces run.start only when no end time', () => {
      const raw = makeOtelRaw('invoke_agent', {
        endTimeUnixNano: '',
        endTime: '',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('run.start');
    });

    it('produces run.error when status is ERROR', () => {
      const raw = makeOtelRaw('invoke_agent', {
        status: { code: 2, message: 'Agent crashed: OOM' },
        events: [
          {
            name: 'exception',
            timeUnixNano: '1712000005000000000',
            attributes: {
              'exception.type': 'OutOfMemoryError',
              'exception.message': 'Heap space exceeded',
              'exception.stacktrace': 'at Agent.run(agent.ts:42)\n  at main(index.ts:10)',
            },
          },
        ],
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const errorEvents = result.events.filter((e) => e.type === 'run.error');
      expect(errorEvents).toHaveLength(1);

      const error = errorEvents[0]!;
      expect((error.payload as Record<string, unknown>)['errorType']).toBe('SpanError');
      expect((error.payload as Record<string, unknown>)['errorMessage']).toBe('Agent crashed: OOM');
      expect((error.payload as Record<string, unknown>)['stackTrace']).toBe(
        'at Agent.run(agent.ts:42)\n  at main(index.ts:10)',
      );
      expect((error.payload as Record<string, unknown>)['fatal']).toBe(false);
      expect(error.tags).toContain('error');

      // run.end should show failure status
      const end = result.events.find((e) => e.type === 'run.end')!;
      expect((end.payload as Record<string, unknown>)['status']).toBe('failure');
    });

    it('also matches "agent.invoke" span name', () => {
      const raw = makeOtelRaw('agent.invoke', {});
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'run.start')).toBe(true);
    });

    it('also matches "agent.run" span name', () => {
      const raw = makeOtelRaw('agent.run', {});
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'run.start')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // chat → model.request + model.response
  // -----------------------------------------------------------------------
  describe('normalize: chat → model.request + model.response', () => {
    it('produces model.request + model.response with token counts', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-copilot',
        attributes: {
          'gen_ai.request.model': 'gpt-4o',
          'gen_ai.usage.input_tokens': 1200,
          'gen_ai.usage.output_tokens': 450,
          'gen_ai.request.temperature': 0.7,
          'gen_ai.usage.cost': 0.025,
        },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.events.length).toBeGreaterThanOrEqual(2);

      const request = result.events.find((e) => e.type === 'model.request')!;
      const response = result.events.find((e) => e.type === 'model.response')!;
      expect(request).toBeDefined();
      expect(response).toBeDefined();

      // model.request
      const reqPayload = request.payload as Record<string, unknown>;
      expect(reqPayload['modelProvider']).toBe('openai');
      expect(reqPayload['modelId']).toBe('gpt-4o');
      expect(reqPayload['inputTokens']).toBe(1200);
      expect(reqPayload['temperature']).toBe(0.7);

      // model.response
      const resPayload = response.payload as Record<string, unknown>;
      expect(resPayload['modelProvider']).toBe('openai');
      expect(resPayload['modelId']).toBe('gpt-4o');
      expect(resPayload['inputTokens']).toBe(1200);
      expect(resPayload['outputTokens']).toBe(450);
      expect(resPayload['latencyMs']).toBe(5000);
      expect(resPayload['cost']).toBe(0.025);

      // response links back to request
      expect(response.parentEventId).toBe(request.id);
    });

    it('detects anthropic provider for otel-claude vendor', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-claude',
        attributes: { 'gen_ai.request.model': 'claude-3.5-sonnet' },
        resourceAttributes: { 'service.name': 'claude-code' },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const request = result.events.find((e) => e.type === 'model.request')!;
      expect((request.payload as Record<string, unknown>)['modelProvider']).toBe('anthropic');
    });

    it('uses "unknown" when model not in attributes', () => {
      const raw = makeOtelRaw('chat', {
        attributes: {},
        resourceAttributes: {},
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const request = result.events.find((e) => e.type === 'model.request')!;
      expect((request.payload as Record<string, unknown>)['modelId']).toBe('unknown');
    });

    it('handles alternative token attribute names (prompt_tokens/completion_tokens)', () => {
      const raw = makeOtelRaw('chat', {
        attributes: {
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.usage.prompt_tokens': 800,
          'gen_ai.usage.completion_tokens': 200,
        },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const response = result.events.find((e) => e.type === 'model.response')!;
      const payload = response.payload as Record<string, unknown>;
      expect(payload['inputTokens']).toBe(800);
      expect(payload['outputTokens']).toBe(200);
    });

    it('produces model.request only when no end time', () => {
      const raw = makeOtelRaw('chat', {
        attributes: { 'gen_ai.request.model': 'gpt-4' },
        endTimeUnixNano: '',
        endTime: '',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('model.request');
    });

    it('also matches "inference" span name', () => {
      const raw = makeOtelRaw('inference', {
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'model.request')).toBe(true);
    });

    it('also matches "chat.completion" span name', () => {
      const raw = makeOtelRaw('openai.chat.completion', {
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'model.request')).toBe(true);
    });

    it('falls back to chat mapping when gen_ai.request.model attribute present', () => {
      const raw = makeOtelRaw('some_custom_llm_call', {
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'model.request')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // execute_tool → tool.call.start + tool.call.end
  // -----------------------------------------------------------------------
  describe('normalize: execute_tool → tool.call.start + tool.call.end', () => {
    it('produces tool.call.start + tool.call.end', () => {
      const raw = makeOtelRaw('execute_tool', {
        attributes: {
          'gen_ai.tool.name': 'read_file',
          'gen_ai.tool.id': 'tool-rf-001',
          'gen_ai.tool.input': { path: '/src/index.ts' },
          'gen_ai.tool.output': { content: 'file contents' },
        },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.events.length).toBeGreaterThanOrEqual(2);

      const start = result.events.find((e) => e.type === 'tool.call.start')!;
      const end = result.events.find((e) => e.type === 'tool.call.end')!;
      expect(start).toBeDefined();
      expect(end).toBeDefined();

      // tool.call.start
      const startPayload = start.payload as Record<string, unknown>;
      expect(startPayload['toolName']).toBe('read_file');
      expect(startPayload['toolId']).toBe('tool-rf-001');
      expect(startPayload['inputParameters']).toEqual({ path: '/src/index.ts' });

      // tool.call.end
      const endPayload = end.payload as Record<string, unknown>;
      expect(endPayload['toolName']).toBe('read_file');
      expect(endPayload['toolId']).toBe('tool-rf-001');
      expect(endPayload['output']).toEqual({ content: 'file contents' });
      expect(endPayload['durationMs']).toBe(5000);
      expect(endPayload['success']).toBe(true);

      // end links to start
      expect(end.parentEventId).toBe(start.id);
    });

    it('uses span name as toolName when not in attributes', () => {
      const raw = makeOtelRaw('execute_tool', {
        attributes: {},
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events.find((e) => e.type === 'tool.call.start')!;
      expect((start.payload as Record<string, unknown>)['toolName']).toBe('execute_tool');
    });

    it('collects gen_ai.tool.* attributes as inputParameters', () => {
      const raw = makeOtelRaw('execute_tool', {
        attributes: {
          'gen_ai.tool.name': 'search',
          'gen_ai.tool.query': 'find all tests',
          'gen_ai.tool.limit': 10,
        },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const start = result.events.find((e) => e.type === 'tool.call.start')!;
      const params = (start.payload as Record<string, unknown>)['inputParameters'] as Record<string, unknown>;
      expect(params['query']).toBe('find all tests');
      expect(params['limit']).toBe(10);
    });

    it('produces tool.call.error when status is ERROR', () => {
      const raw = makeOtelRaw('execute_tool', {
        attributes: { 'gen_ai.tool.name': 'write_file' },
        status: { code: 2, message: 'Permission denied: /etc/passwd' },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const errorEvents = result.events.filter((e) => e.type === 'tool.call.error');
      expect(errorEvents).toHaveLength(1);

      const error = errorEvents[0]!;
      const payload = error.payload as Record<string, unknown>;
      expect(payload['toolName']).toBe('write_file');
      expect(payload['errorType']).toBe('ToolCallError');
      expect(payload['errorMessage']).toBe('Permission denied: /etc/passwd');
      expect(error.tags).toContain('error');

      // tool.call.end should have success: false
      const end = result.events.find((e) => e.type === 'tool.call.end')!;
      expect((end.payload as Record<string, unknown>)['success']).toBe(false);
    });

    it('produces tool.call.start only when no end time', () => {
      const raw = makeOtelRaw('execute_tool', {
        attributes: { 'gen_ai.tool.name': 'slow_operation' },
        endTimeUnixNano: '',
        endTime: '',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      expect(result.events).toHaveLength(1);
      expect(result.events[0]!.type).toBe('tool.call.start');
    });

    it('also matches "tool.call" span name', () => {
      const raw = makeOtelRaw('copilot.tool.call', {
        attributes: { 'gen_ai.tool.name': 'read_file' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'tool.call.start')).toBe(true);
    });

    it('falls back to tool mapping when gen_ai.tool.name attribute present', () => {
      const raw = makeOtelRaw('custom_span_xyz', {
        attributes: { 'gen_ai.tool.name': 'run_test' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events.some((e) => e.type === 'tool.call.start')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown span → annotation
  // -----------------------------------------------------------------------
  describe('normalize: unknown span → annotation', () => {
    it('creates annotation for unrecognized span names', () => {
      const raw = makeOtelRaw('http.request', {
        attributes: { 'http.method': 'GET', 'http.url': 'https://api.example.com' },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status !== 'success') return;

      expect(result.events).toHaveLength(1);
      const annotation = result.events[0]!;
      expect(annotation.type).toBe('annotation');
      expect(annotation.tags).toContain('unmapped');

      const payload = annotation.payload as Record<string, unknown>;
      expect(payload['key']).toBe('otel.span');
      expect(payload['annotatedBy']).toBe('opentelemetry');

      const value = payload['value'] as Record<string, unknown>;
      expect(value['name']).toBe('http.request');
      expect((value['attributes'] as Record<string, unknown>)['http.method']).toBe('GET');
    });
  });

  // -----------------------------------------------------------------------
  // Trace context preservation
  // -----------------------------------------------------------------------
  describe('trace context', () => {
    it('uses runId from raw event when provided', () => {
      const raw = makeOtelRaw('invoke_agent', {
        traceId: 'trace-from-span',
        runId: 'explicit-run-id',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      expect(result.events[0]!.runId).toBe('explicit-run-id');
    });

    it('falls back to traceId when runId not on raw event', () => {
      const raw = makeOtelRaw('chat', {
        traceId: 'aabb1122ccdd3344',
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });
      // Remove runId if set by helper
      delete (raw as Record<string, unknown>)['runId'];

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      expect(result.events[0]!.runId).toBe('aabb1122ccdd3344');
    });

    it('preserves rawMeta with normalization context', () => {
      const raw = makeOtelRaw('invoke_agent', {
        traceId: 'trace-001',
        spanId: 'span-001',
        scopeName: 'my-scope',
        scopeVersion: '2.0.0',
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const meta = result.events[0]!.rawMeta as Record<string, unknown>;
      expect(meta['normalizedBy']).toBe('otel-genai');
      expect(meta['originalSpanName']).toBe('invoke_agent');
      expect(meta['traceId']).toBe('trace-001');
      expect(meta['spanId']).toBe('span-001');
      expect(meta['vendor']).toBe('otel-copilot');
      expect(meta['scopeName']).toBe('my-scope');
      expect(meta['scopeVersion']).toBe('2.0.0');
      expect(meta['receivedAt']).toBe('2024-04-01T20:00:06.000Z');
    });
  });

  // -----------------------------------------------------------------------
  // Duration calculation
  // -----------------------------------------------------------------------
  describe('duration calculation', () => {
    it('computes durationMs from nanosecond timestamps', () => {
      const raw = makeOtelRaw('chat', {
        startTimeUnixNano: '1712000000000000000',
        endTimeUnixNano: '1712000002500000000',
        startTime: '2024-04-01T20:00:00.000Z',
        endTime: '2024-04-01T20:00:02.500Z',
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const response = result.events.find((e) => e.type === 'model.response')!;
      expect((response.payload as Record<string, unknown>)['latencyMs']).toBe(2500);
    });

    it('handles missing nano timestamps gracefully', () => {
      const raw = makeOtelRaw('chat', {
        startTimeUnixNano: '',
        endTimeUnixNano: '',
        attributes: { 'gen_ai.request.model': 'gpt-4' },
      });

      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      const response = result.events.find((e) => e.type === 'model.response');
      if (response) {
        expect((response.payload as Record<string, unknown>)['latencyMs']).toBeUndefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Model provider detection
  // -----------------------------------------------------------------------
  describe('model provider detection', () => {
    it('detects openai from copilot service name', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-copilot',
        attributes: { 'gen_ai.request.model': 'gpt-4' },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      const req = result.events.find((e) => e.type === 'model.request')!;
      expect((req.payload as Record<string, unknown>)['modelProvider']).toBe('openai');
    });

    it('detects anthropic from claude service name', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-claude',
        attributes: { 'gen_ai.request.model': 'claude-3' },
        resourceAttributes: { 'service.name': 'claude-code' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      const req = result.events.find((e) => e.type === 'model.request')!;
      expect((req.payload as Record<string, unknown>)['modelProvider']).toBe('anthropic');
    });

    it('detects google from gemini service name', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-genai',
        attributes: { 'gen_ai.request.model': 'gemini-pro' },
        resourceAttributes: { 'service.name': 'google-gemini-agent' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      const req = result.events.find((e) => e.type === 'model.request')!;
      expect((req.payload as Record<string, unknown>)['modelProvider']).toBe('google');
    });

    it('falls back to vendor map for unknown service name', () => {
      const raw = makeOtelRaw('chat', {
        vendor: 'otel-codex',
        attributes: { 'gen_ai.request.model': 'codex-mini' },
        resourceAttributes: { 'service.name': 'my-custom-agent' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      const req = result.events.find((e) => e.type === 'model.request')!;
      expect((req.payload as Record<string, unknown>)['modelProvider']).toBe('openai');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('returns error when name field is missing', () => {
      const raw: RawVendorEvent = {
        vendor: 'otel-genai',
        tenantId: 'tenant-001',
        receivedAt: '2024-04-01T20:00:00.000Z',
        data: {
          traceId: 'trace-001',
          spanId: 'span-001',
          attributes: {},
        },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Missing "name"');
      }
    });

    it('returns error result on unexpected exceptions', () => {
      const raw: RawVendorEvent = {
        vendor: 'otel-genai',
        tenantId: 'tenant-001',
        receivedAt: '2024-04-01T20:00:00.000Z',
        data: {
          name: 'invoke_agent',
          traceId: 'trace-001',
          spanId: 'span-001',
          // Missing attributes — will be handled gracefully
          startTimeUnixNano: 'not-a-number',
          endTimeUnixNano: 'also-not-a-number',
          startTime: '2024-04-01T00:00:00Z',
          endTime: '2024-04-01T00:00:01Z',
        },
      };

      const result = adapter.normalize(raw);
      // Should either succeed gracefully or return error — never throw
      expect(result.status).toMatch(/^(success|error)$/);
    });
  });

  // -----------------------------------------------------------------------
  // Realistic Copilot OTel trace — full scenario
  // -----------------------------------------------------------------------
  describe('realistic Copilot OTel trace', () => {
    const traceId = 'aabb1122ccdd3344eeff5566aabb1122';

    it('maps a full agent session: invoke_agent → chat → execute_tool → chat', () => {
      const agentRaw = makeOtelRaw('invoke_agent', {
        traceId,
        spanId: 'span-agent-root',
        parentSpanId: '',
        startTimeUnixNano: '1712000000000000000',
        endTimeUnixNano: '1712000030000000000',
        startTime: '2024-04-01T20:00:00.000Z',
        endTime: '2024-04-01T20:00:30.000Z',
        attributes: { 'gen_ai.agent.name': 'copilot-workspace' },
        resourceAttributes: { 'service.name': 'copilot-chat', 'service.version': '1.42.0' },
      });

      const chatRaw1 = makeOtelRaw('chat', {
        traceId,
        spanId: 'span-chat-001',
        parentSpanId: 'span-agent-root',
        startTimeUnixNano: '1712000001000000000',
        endTimeUnixNano: '1712000003000000000',
        startTime: '2024-04-01T20:00:01.000Z',
        endTime: '2024-04-01T20:00:03.000Z',
        attributes: {
          'gen_ai.request.model': 'gpt-4o',
          'gen_ai.usage.input_tokens': 500,
          'gen_ai.usage.output_tokens': 120,
        },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });

      const toolRaw = makeOtelRaw('execute_tool', {
        traceId,
        spanId: 'span-tool-001',
        parentSpanId: 'span-agent-root',
        startTimeUnixNano: '1712000003000000000',
        endTimeUnixNano: '1712000004000000000',
        startTime: '2024-04-01T20:00:03.000Z',
        endTime: '2024-04-01T20:00:04.000Z',
        attributes: {
          'gen_ai.tool.name': 'read_file',
          'gen_ai.tool.input': { path: '/src/app.ts' },
        },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });

      const chatRaw2 = makeOtelRaw('chat', {
        traceId,
        spanId: 'span-chat-002',
        parentSpanId: 'span-agent-root',
        startTimeUnixNano: '1712000004000000000',
        endTimeUnixNano: '1712000010000000000',
        startTime: '2024-04-01T20:00:04.000Z',
        endTime: '2024-04-01T20:00:10.000Z',
        attributes: {
          'gen_ai.request.model': 'gpt-4o',
          'gen_ai.usage.input_tokens': 1500,
          'gen_ai.usage.output_tokens': 800,
        },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });

      // Normalize each span
      const agentResult = adapter.normalize(agentRaw);
      const chat1Result = adapter.normalize(chatRaw1);
      const toolResult = adapter.normalize(toolRaw);
      const chat2Result = adapter.normalize(chatRaw2);

      // All succeed
      expect(agentResult.status).toBe('success');
      expect(chat1Result.status).toBe('success');
      expect(toolResult.status).toBe('success');
      expect(chat2Result.status).toBe('success');

      if (
        agentResult.status !== 'success' ||
        chat1Result.status !== 'success' ||
        toolResult.status !== 'success' ||
        chat2Result.status !== 'success'
      ) return;

      // Collect all events
      const allEvents = [
        ...agentResult.events,
        ...chat1Result.events,
        ...toolResult.events,
        ...chat2Result.events,
      ];

      // All share the same runId
      const runIds = new Set(allEvents.map((e) => e.runId));
      expect(runIds.size).toBe(1);
      expect(runIds.has(traceId as unknown as string)).toBe(true);

      // Event type counts
      const typeCounts = allEvents.reduce(
        (acc, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      expect(typeCounts['run.start']).toBe(1);
      expect(typeCounts['run.end']).toBe(1);
      expect(typeCounts['model.request']).toBe(2);
      expect(typeCounts['model.response']).toBe(2);
      expect(typeCounts['tool.call.start']).toBe(1);
      expect(typeCounts['tool.call.end']).toBe(1);

      // Agent span duration
      const runEnd = allEvents.find((e) => e.type === 'run.end')!;
      expect((runEnd.payload as Record<string, unknown>)['durationMs']).toBe(30000);

      // Child spans reference the parent
      const chat1Events = chat1Result.events;
      expect(chat1Events[0]!.parentEventId).toBe('span-agent-root');

      const toolEvents = toolResult.events;
      expect(toolEvents[0]!.parentEventId).toBe('span-agent-root');
    });
  });

  // -----------------------------------------------------------------------
  // sourceAgent detection
  // -----------------------------------------------------------------------
  describe('sourceAgent', () => {
    it('uses gen_ai.agent.name from attributes', () => {
      const raw = makeOtelRaw('invoke_agent', {
        attributes: { 'gen_ai.agent.name': 'my-custom-agent' },
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events[0]!.sourceAgent).toBe('my-custom-agent');
    });

    it('falls back to service.name from resource attributes', () => {
      const raw = makeOtelRaw('invoke_agent', {
        attributes: {},
        resourceAttributes: { 'service.name': 'copilot-chat' },
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events[0]!.sourceAgent).toBe('copilot-chat');
    });

    it('falls back to vendor-agent when no names available', () => {
      const raw = makeOtelRaw('invoke_agent', {
        vendor: 'otel-genai',
        attributes: {},
        resourceAttributes: {},
      });
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;
      expect(result.events[0]!.sourceAgent).toBe('otel-genai-agent');
    });
  });

  // -----------------------------------------------------------------------
  // schemaVersion
  // -----------------------------------------------------------------------
  describe('schemaVersion', () => {
    it('includes schema version on all events', () => {
      const raw = makeOtelRaw('invoke_agent');
      const result = adapter.normalize(raw);
      if (result.status !== 'success') return;

      for (const event of result.events) {
        expect(event.schemaVersion).toBe('1.0.0');
      }
    });
  });
});
