import { describe, it, expect } from 'vitest';
import {
  exportTraceServiceRequestSchema,
  parseOtlpTraces,
  spanToRawEvent,
  detectVendor,
} from '../parsers/otlp-parser.js';
import type { ExportTraceServiceRequestInput } from '../parsers/otlp-parser.js';

// ---------------------------------------------------------------------------
// Fixtures — realistic Copilot OTel trace
// ---------------------------------------------------------------------------

function makeAttribute(key: string, value: unknown): { key: string; value: Record<string, unknown> } {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'number' && Number.isInteger(value)) return { key, value: { intValue: value } };
  if (typeof value === 'number') return { key, value: { doubleValue: value } };
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}

const TRACE_ID = 'abcdef1234567890abcdef1234567890';
const ROOT_SPAN_ID = 'aaaa000000000001';
const CHAT_SPAN_ID = 'aaaa000000000002';
const TOOL_SPAN_ID = 'aaaa000000000003';

/** Simulates an ExportTraceServiceRequest from VS Code Copilot Chat. */
function makeCopilotTraceRequest(): ExportTraceServiceRequestInput {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            makeAttribute('service.name', 'copilot-chat'),
            makeAttribute('service.version', '0.42.0'),
            makeAttribute('session.id', 'session-abc-123'),
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: '@opentelemetry/instrumentation-copilot',
              version: '1.0.0',
            },
            spans: [
              // Root: invoke_agent
              {
                traceId: TRACE_ID,
                spanId: ROOT_SPAN_ID,
                parentSpanId: '',
                name: 'invoke_agent',
                kind: 1,
                startTimeUnixNano: '1712000000000000000',
                endTimeUnixNano: '1712000005000000000',
                attributes: [
                  makeAttribute('gen_ai.agent.name', 'copilot'),
                  makeAttribute('gen_ai.usage.input_tokens', 1200),
                  makeAttribute('gen_ai.usage.output_tokens', 800),
                ],
                status: { code: 1 },
                events: [],
                links: [],
              },
              // Child: chat (LLM call)
              {
                traceId: TRACE_ID,
                spanId: CHAT_SPAN_ID,
                parentSpanId: ROOT_SPAN_ID,
                name: 'chat',
                kind: 3,
                startTimeUnixNano: '1712000000500000000',
                endTimeUnixNano: '1712000002500000000',
                attributes: [
                  makeAttribute('gen_ai.request.model', 'gpt-4o'),
                  makeAttribute('gen_ai.usage.input_tokens', 600),
                  makeAttribute('gen_ai.usage.output_tokens', 400),
                  makeAttribute('gen_ai.response.finish_reasons', 'stop'),
                ],
                status: { code: 1 },
                events: [
                  {
                    name: 'gen_ai.content.prompt',
                    timeUnixNano: '1712000000500000000',
                    attributes: [
                      makeAttribute('gen_ai.prompt', 'Explain this function'),
                    ],
                  },
                ],
                links: [],
              },
              // Child: execute_tool
              {
                traceId: TRACE_ID,
                spanId: TOOL_SPAN_ID,
                parentSpanId: ROOT_SPAN_ID,
                name: 'execute_tool',
                kind: 1,
                startTimeUnixNano: '1712000002600000000',
                endTimeUnixNano: '1712000003000000000',
                attributes: [
                  makeAttribute('gen_ai.tool.name', 'read_file'),
                  makeAttribute('gen_ai.tool.call.id', 'call-xyz'),
                ],
                status: { code: 1 },
                events: [],
                links: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Minimal valid request with one span */
function makeMinimalRequest(): ExportTraceServiceRequestInput {
  return {
    resourceSpans: [
      {
        resource: { attributes: [] },
        scopeSpans: [
          {
            spans: [
              {
                traceId: 'aaaa0000000000000000000000000001',
                spanId: 'bbbb000000000001',
                name: 'test-span',
                startTimeUnixNano: '1712000000000000000',
              },
            ],
          },
        ],
      },
    ],
  };
}

function parseRequest(request: ExportTraceServiceRequestInput) {
  return parseOtlpTraces(exportTraceServiceRequestSchema.parse(request));
}

// =========================================================================
// Tests
// =========================================================================

describe('exportTraceServiceRequestSchema', () => {
  it('validates a realistic Copilot OTel trace', () => {
    const result = exportTraceServiceRequestSchema.safeParse(makeCopilotTraceRequest());
    expect(result.success).toBe(true);
  });

  it('accepts an empty request', () => {
    const result = exportTraceServiceRequestSchema.safeParse({ resourceSpans: [] });
    expect(result.success).toBe(true);
    expect(result.data?.resourceSpans).toHaveLength(0);
  });

  it('defaults resourceSpans when missing', () => {
    const result = exportTraceServiceRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.resourceSpans).toHaveLength(0);
  });

  it('rejects when resourceSpans is not an array', () => {
    const result = exportTraceServiceRequestSchema.safeParse({ resourceSpans: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects span missing traceId', () => {
    const result = exportTraceServiceRequestSchema.safeParse({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [{ spanId: 'abc', name: 'test', startTimeUnixNano: '0' }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects span missing startTimeUnixNano', () => {
    const result = exportTraceServiceRequestSchema.safeParse({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [{ traceId: 'abc', spanId: 'def', name: 'test' }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// -------------------------------------------------------------------------

describe('parseOtlpTraces', () => {
  it('flattens 3 Copilot spans from nested structure', () => {
    const result = parseRequest(makeCopilotTraceRequest());

    expect(result.spanCount).toBe(3);
    expect(result.resourceCount).toBe(1);
    expect(result.spans).toHaveLength(3);
  });

  it('extracts resource attributes on every span', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());

    for (const span of spans) {
      expect(span.resourceAttributes['service.name']).toBe('copilot-chat');
      expect(span.resourceAttributes['service.version']).toBe('0.42.0');
      expect(span.resourceAttributes['session.id']).toBe('session-abc-123');
    }
  });

  it('extracts scope info on every span', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());


    for (const span of spans) {
      expect(span.scopeName).toBe('@opentelemetry/instrumentation-copilot');
      expect(span.scopeVersion).toBe('1.0.0');
    }
  });

  it('preserves span-level attributes', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());

    const agentSpan = spans.find((s) => s.name === 'invoke_agent')!;
    expect(agentSpan.attributes['gen_ai.agent.name']).toBe('copilot');
    expect(agentSpan.attributes['gen_ai.usage.input_tokens']).toBe(1200);

    const chatSpan = spans.find((s) => s.name === 'chat')!;
    expect(chatSpan.attributes['gen_ai.request.model']).toBe('gpt-4o');
    expect(chatSpan.attributes['gen_ai.usage.output_tokens']).toBe(400);

    const toolSpan = spans.find((s) => s.name === 'execute_tool')!;
    expect(toolSpan.attributes['gen_ai.tool.name']).toBe('read_file');
  });

  it('preserves parent-child relationships', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());

    const root = spans.find((s) => s.name === 'invoke_agent')!;
    expect(root.parentSpanId).toBe('');

    const chat = spans.find((s) => s.name === 'chat')!;
    expect(chat.parentSpanId).toBe(ROOT_SPAN_ID);

    const tool = spans.find((s) => s.name === 'execute_tool')!;
    expect(tool.parentSpanId).toBe(ROOT_SPAN_ID);
  });

  it('extracts span events', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());
    const chatSpan = spans.find((s) => s.name === 'chat')!;
    const event = chatSpan.events[0]!;


    expect(chatSpan.events).toHaveLength(1);
    expect(event.name).toBe('gen_ai.content.prompt');
    expect(event.attributes['gen_ai.prompt']).toBe('Explain this function');
  });

  it('converts timestamps from nanos', () => {
    const { spans } = parseRequest(makeCopilotTraceRequest());
    const root = spans.find((s) => s.name === 'invoke_agent')!;

    expect(root.startTimeUnixNano).toBe('1712000000000000000');
    expect(root.endTimeUnixNano).toBe('1712000005000000000');
  });

  it('handles empty request with no spans', () => {
    const result = parseOtlpTraces({ resourceSpans: [] });
    expect(result.spanCount).toBe(0);
    expect(result.spans).toHaveLength(0);
  });

  it('handles multiple resource spans', () => {
    const request: ExportTraceServiceRequestInput = {
      resourceSpans: [
        {
          resource: { attributes: [makeAttribute('service.name', 'copilot-chat')] },
          scopeSpans: [{ spans: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), name: 's1', startTimeUnixNano: '1' }] }],
        },
        {
          resource: { attributes: [makeAttribute('service.name', 'codex-cli')] },
          scopeSpans: [{ spans: [{ traceId: 'c'.repeat(32), spanId: 'd'.repeat(16), name: 's2', startTimeUnixNano: '2' }] }],
        },
      ],
    };
    const validated = exportTraceServiceRequestSchema.parse(request);
    const result = parseOtlpTraces(validated);
    const firstSpan = result.spans[0]!;
    const secondSpan = result.spans[1]!;

    expect(result.spanCount).toBe(2);
    expect(result.resourceCount).toBe(2);
    expect(firstSpan.resourceAttributes['service.name']).toBe('copilot-chat');
    expect(secondSpan.resourceAttributes['service.name']).toBe('codex-cli');
  });

  it('handles minimal span with defaults', () => {
    const validated = exportTraceServiceRequestSchema.parse(makeMinimalRequest());
    const result = parseOtlpTraces(validated);

    expect(result.spanCount).toBe(1);
    const span = result.spans[0]!;
    expect(span.name).toBe('test-span');
    expect(span.parentSpanId).toBe('');
    expect(span.kind).toBe(0);
    expect(span.endTimeUnixNano).toBe('');
    expect(span.events).toHaveLength(0);
    expect(span.links).toHaveLength(0);
    expect(span.scopeName).toBe('');
  });
});

// -------------------------------------------------------------------------

describe('detectVendor', () => {
  it('detects copilot from service.name', () => {
    expect(detectVendor({ 'service.name': 'copilot-chat' })).toBe('otel-copilot');
  });

  it('detects codex from service.name', () => {
    expect(detectVendor({ 'service.name': 'openai-codex-cli' })).toBe('otel-codex');
  });

  it('detects claude from service.name', () => {
    expect(detectVendor({ 'service.name': 'claude-code' })).toBe('otel-claude');
  });

  it('detects cursor from service.name', () => {
    expect(detectVendor({ 'service.name': 'cursor-agent' })).toBe('otel-cursor');
  });

  it('falls back to otel-genai for unknown service', () => {
    expect(detectVendor({ 'service.name': 'my-custom-agent' })).toBe('otel-genai');
  });

  it('falls back to otel-genai when service.name missing', () => {
    expect(detectVendor({})).toBe('otel-genai');
  });

  it('is case-insensitive', () => {
    expect(detectVendor({ 'service.name': 'GitHub-Copilot-Chat' })).toBe('otel-copilot');
  });
});

// -------------------------------------------------------------------------

describe('spanToRawEvent', () => {
  it('maps a flat span to a RawVendorEvent', () => {
    const { spans } = parseOtlpTraces(
      exportTraceServiceRequestSchema.parse(makeCopilotTraceRequest()),
    );
    const chatSpan = spans.find((s) => s.name === 'chat')!;
    const receivedAt = '2026-04-08T12:00:00.000Z';

    const raw = spanToRawEvent(chatSpan, 'tenant-test', receivedAt);

    expect(raw.vendor).toBe('otel-copilot');
    expect(raw.tenantId).toBe('tenant-test');
    expect(raw.receivedAt).toBe(receivedAt);
    expect(raw.runId).toBe(TRACE_ID);
  });

  it('includes span identity in data', () => {
    const { spans } = parseOtlpTraces(
      exportTraceServiceRequestSchema.parse(makeCopilotTraceRequest()),
    );
    const toolSpan = spans.find((s) => s.name === 'execute_tool')!;
    const raw = spanToRawEvent(toolSpan, 'tenant-test', new Date().toISOString());

    expect(raw.data['traceId']).toBe(TRACE_ID);
    expect(raw.data['spanId']).toBe(TOOL_SPAN_ID);
    expect(raw.data['parentSpanId']).toBe(ROOT_SPAN_ID);
    expect(raw.data['name']).toBe('execute_tool');
  });

  it('includes ISO timestamps in data', () => {
    const { spans } = parseOtlpTraces(
      exportTraceServiceRequestSchema.parse(makeCopilotTraceRequest()),
    );
    const root = spans.find((s) => s.name === 'invoke_agent')!;
    const raw = spanToRawEvent(root, 'tenant-test', new Date().toISOString());

    expect(raw.data['startTime']).toBeDefined();
    expect(typeof raw.data['startTime']).toBe('string');
    // 1712000000000000000 nanoseconds = 2024-04-01T22:13:20.000Z
    expect((raw.data['startTime'] as string).startsWith('2024-')).toBe(true);
  });

  it('includes resource and span attributes in data', () => {
    const { spans } = parseOtlpTraces(
      exportTraceServiceRequestSchema.parse(makeCopilotTraceRequest()),
    );
    const chatSpan = spans.find((s) => s.name === 'chat')!;
    const raw = spanToRawEvent(chatSpan, 'tenant-test', new Date().toISOString());

    const attrs = raw.data['attributes'] as Record<string, unknown>;
    expect(attrs['gen_ai.request.model']).toBe('gpt-4o');

    const resAttrs = raw.data['resourceAttributes'] as Record<string, unknown>;
    expect(resAttrs['service.name']).toBe('copilot-chat');
  });
});
