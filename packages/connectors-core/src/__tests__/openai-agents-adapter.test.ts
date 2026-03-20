import { describe, it, expect } from 'vitest';
import { OpenAIAgentsAdapter } from '../openai-agents-adapter.js';
import type { RawVendorEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpenAIRaw(
  type: string,
  data: Record<string, unknown> = {},
  overrides?: Partial<RawVendorEvent>,
): RawVendorEvent {
  return {
    vendor: 'openai-agents',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    runId: 'b0000001-0000-4000-8000-000000000001',
    data: {
      type,
      trace_id: 'trace-001',
      span_id: 'a0000001-0000-4000-8000-000000000001',
      timestamp: '2026-03-15T10:00:00.000Z',
      agent_name: 'test-openai-agent',
      data,
      ...overrides?.data,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAIAgentsAdapter', () => {
  const adapter = new OpenAIAgentsAdapter();

  describe('vendorId', () => {
    it('should be "openai-agents"', () => {
      expect(adapter.vendorId).toBe('openai-agents');
    });
  });

  describe('canHandle', () => {
    it('returns true for agent.start', () => {
      expect(adapter.canHandle(makeOpenAIRaw('agent.start'))).toBe(true);
    });

    it('returns true for agent.end', () => {
      expect(adapter.canHandle(makeOpenAIRaw('agent.end'))).toBe(true);
    });

    it('returns true for tool_call.start', () => {
      expect(adapter.canHandle(makeOpenAIRaw('tool_call.start'))).toBe(true);
    });

    it('returns true for tool_call.end', () => {
      expect(adapter.canHandle(makeOpenAIRaw('tool_call.end'))).toBe(true);
    });

    it('returns true for tool_call.error', () => {
      expect(adapter.canHandle(makeOpenAIRaw('tool_call.error'))).toBe(true);
    });

    it('returns true for generation.start', () => {
      expect(adapter.canHandle(makeOpenAIRaw('generation.start'))).toBe(true);
    });

    it('returns true for generation.end', () => {
      expect(adapter.canHandle(makeOpenAIRaw('generation.end'))).toBe(true);
    });

    it('returns true for handoff', () => {
      expect(adapter.canHandle(makeOpenAIRaw('handoff'))).toBe(true);
    });

    it('returns true for guardrail.start', () => {
      expect(adapter.canHandle(makeOpenAIRaw('guardrail.start'))).toBe(true);
    });

    it('returns true for guardrail.end', () => {
      expect(adapter.canHandle(makeOpenAIRaw('guardrail.end'))).toBe(true);
    });

    it('returns true for response.output_text', () => {
      expect(adapter.canHandle(makeOpenAIRaw('response.output_text'))).toBe(true);
    });

    it('returns false for unknown types', () => {
      expect(adapter.canHandle(makeOpenAIRaw('unknown.type'))).toBe(false);
    });

    it('returns false for missing type', () => {
      const raw: RawVendorEvent = {
        vendor: 'openai-agents',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { foo: 'bar' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // agent.start → run.start
  // -------------------------------------------------------------------------
  describe('normalize: agent.start → run.start', () => {
    it('maps agent.start to run.start with correct payload', () => {
      const raw = makeOpenAIRaw('agent.start', {
        name: 'my-agent',
        parent_run_id: 'parent-run-001',
        config: { temperature: 0.5 },
      });

      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        const event = result.events[0]!;
        expect(event.type).toBe('run.start');
        expect(event.sourceFramework).toBe('openai-agents');
        expect(event.tenantId).toBe('tenant-test-001');
        expect(event.tags).toContain('openai-agents');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('my-agent');
        expect(payload['triggerSource']).toBe('agent');
        expect(payload['parentRunId']).toBe('parent-run-001');
        expect(payload['configuration']).toEqual({ temperature: 0.5 });
      }
    });

    it('falls back to agent_name when name not in data', () => {
      const raw = makeOpenAIRaw('agent.start', {});

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('test-openai-agent');
      }
    });
  });

  // -------------------------------------------------------------------------
  // agent.end → run.end
  // -------------------------------------------------------------------------
  describe('normalize: agent.end → run.end', () => {
    it('maps completed status to success', () => {
      const raw = makeOpenAIRaw('agent.end', {
        status: 'completed',
        duration_ms: 1500,
        summary: 'Agent done',
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('run.end');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['status']).toBe('success');
        expect(payload['durationMs']).toBe(1500);
        expect(payload['summary']).toBe('Agent done');
      }
    });

    it('maps failed status to failure', () => {
      const raw = makeOpenAIRaw('agent.end', { status: 'failed' });
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('failure');
      }
    });

    it('maps timed_out status to timeout', () => {
      const raw = makeOpenAIRaw('agent.end', { status: 'timed_out' });
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('timeout');
      }
    });

    it('maps cancelled status to cancelled', () => {
      const raw = makeOpenAIRaw('agent.end', { status: 'cancelled' });
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('cancelled');
      }
    });

    it('defaults unknown status to success', () => {
      const raw = makeOpenAIRaw('agent.end', { status: 'weird_status' });
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('success');
      }
    });
  });

  // -------------------------------------------------------------------------
  // tool_call.start → tool.call.start
  // -------------------------------------------------------------------------
  describe('normalize: tool_call.start → tool.call.start', () => {
    it('maps tool call with arguments', () => {
      const raw = makeOpenAIRaw('tool_call.start', {
        name: 'web_search',
        tool_call_id: 'tc-001',
        arguments: { query: 'hello world' },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('tool.call.start');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('web_search');
        expect(payload['toolId']).toBe('tc-001');
        expect(payload['inputParameters']).toEqual({ query: 'hello world' });
      }
    });

    it('falls back to tool_name field', () => {
      const raw = makeOpenAIRaw('tool_call.start', {
        tool_name: 'calculator',
        input: { x: 5 },
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('calculator');
        expect(payload['inputParameters']).toEqual({ x: 5 });
      }
    });

    it('uses "unknown" for missing tool name', () => {
      const raw = makeOpenAIRaw('tool_call.start', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('unknown');
        expect(payload['inputParameters']).toEqual({});
      }
    });
  });

  // -------------------------------------------------------------------------
  // tool_call.end → tool.call.end
  // -------------------------------------------------------------------------
  describe('normalize: tool_call.end → tool.call.end', () => {
    it('maps successful tool call result', () => {
      const raw = makeOpenAIRaw('tool_call.end', {
        name: 'web_search',
        tool_call_id: 'tc-001',
        output: { results: ['hello'] },
        duration_ms: 200,
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('web_search');
        expect(payload['output']).toEqual({ results: ['hello'] });
        expect(payload['durationMs']).toBe(200);
        expect(payload['success']).toBe(true);
      }
    });

    it('marks success false when error is present', () => {
      const raw = makeOpenAIRaw('tool_call.end', {
        name: 'web_search',
        error: 'timeout',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['success']).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // tool_call.error → tool.call.error
  // -------------------------------------------------------------------------
  describe('normalize: tool_call.error → tool.call.error', () => {
    it('maps tool call error', () => {
      const raw = makeOpenAIRaw('tool_call.error', {
        name: 'web_search',
        tool_call_id: 'tc-001',
        error_type: 'TimeoutError',
        error_message: 'Request timed out after 30s',
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('web_search');
        expect(payload['errorType']).toBe('TimeoutError');
        expect(payload['errorMessage']).toBe('Request timed out after 30s');
      }
    });

    it('uses defaults for missing error fields', () => {
      const raw = makeOpenAIRaw('tool_call.error', {
        name: 'web_search',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['errorType']).toBe('ToolCallError');
        expect(payload['errorMessage']).toBe('Unknown error');
      }
    });
  });

  // -------------------------------------------------------------------------
  // generation.start → model.request
  // -------------------------------------------------------------------------
  describe('normalize: generation.start → model.request', () => {
    it('maps model request', () => {
      const raw = makeOpenAIRaw('generation.start', {
        model: 'gpt-4o',
        input_tokens: 150,
        temperature: 0.7,
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('model.request');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('openai');
        expect(payload['modelId']).toBe('gpt-4o');
        expect(payload['inputTokens']).toBe(150);
        expect(payload['temperature']).toBe(0.7);
      }
    });
  });

  // -------------------------------------------------------------------------
  // generation.end → model.response
  // -------------------------------------------------------------------------
  describe('normalize: generation.end → model.response', () => {
    it('maps model response with all token counts', () => {
      const raw = makeOpenAIRaw('generation.end', {
        model: 'gpt-4o',
        output_tokens: 50,
        input_tokens: 150,
        duration_ms: 800,
        cost: 0.005,
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('openai');
        expect(payload['modelId']).toBe('gpt-4o');
        expect(payload['outputTokens']).toBe(50);
        expect(payload['inputTokens']).toBe(150);
        expect(payload['latencyMs']).toBe(800);
        expect(payload['cost']).toBe(0.005);
      }
    });

    it('handles alternative field names (completion_tokens, latency_ms)', () => {
      const raw = makeOpenAIRaw('generation.end', {
        model: 'gpt-4',
        completion_tokens: 30,
        prompt_tokens: 100,
        latency_ms: 500,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['outputTokens']).toBe(30);
        expect(payload['inputTokens']).toBe(100);
        expect(payload['latencyMs']).toBe(500);
      }
    });
  });

  // -------------------------------------------------------------------------
  // handoff → custom
  // -------------------------------------------------------------------------
  describe('normalize: handoff → custom', () => {
    it('maps handoff event', () => {
      const raw = makeOpenAIRaw('handoff', {
        target_agent: 'specialist-agent',
        source_agent: 'router-agent',
        reason: 'domain-specific query',
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('custom');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['customType']).toBe('handoff');
        expect(payload['targetAgent']).toBe('specialist-agent');
        expect(payload['sourceAgent']).toBe('router-agent');
        expect(payload['reason']).toBe('domain-specific query');
      }
    });
  });

  // -------------------------------------------------------------------------
  // guardrail.start / guardrail.end → policy.evaluated
  // -------------------------------------------------------------------------
  describe('normalize: guardrail → policy.evaluated', () => {
    it('maps guardrail.start to policy.evaluated', () => {
      const raw = makeOpenAIRaw('guardrail.start', {
        guardrail_id: 'gr-001',
        guardrail_name: 'content-filter',
        result: 'pass',
        details: 'Content is safe',
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('policy.evaluated');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['policyId']).toBe('gr-001');
        expect(payload['policyName']).toBe('content-filter');
        expect(payload['result']).toBe('pass');
        expect(payload['details']).toBe('Content is safe');
      }
    });

    it('maps guardrail.end with tripwire result to fail', () => {
      const raw = makeOpenAIRaw('guardrail.end', {
        guardrail_id: 'gr-002',
        guardrail_name: 'pii-detector',
        result: 'tripwire',
        message: 'PII detected in output',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['result']).toBe('fail');
        expect(payload['details']).toBe('PII detected in output');
      }
    });

    it('defaults unknown guardrail result to pass', () => {
      const raw = makeOpenAIRaw('guardrail.end', {
        guardrail_id: 'gr-003',
        guardrail_name: 'unknown-guard',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['result']).toBe('pass');
      }
    });
  });

  // -------------------------------------------------------------------------
  // response.output_text → prompt.output
  // -------------------------------------------------------------------------
  describe('normalize: response.output_text → prompt.output', () => {
    it('maps output text response', () => {
      const raw = makeOpenAIRaw('response.output_text', {
        text: 'The answer is 42.',
        token_count: 5,
        finish_reason: 'stop',
        model: 'gpt-4o',
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('prompt.output');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['content']).toBe('The answer is 42.');
        expect(payload['tokenCount']).toBe(5);
        expect(payload['finishReason']).toBe('stop');
        expect(payload['modelId']).toBe('gpt-4o');
      }
    });

    it('falls back to content field', () => {
      const raw = makeOpenAIRaw('response.output_text', {
        content: 'Hello world',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['content']).toBe('Hello world');
      }
    });
  });

  // -------------------------------------------------------------------------
  // rawMeta preservation
  // -------------------------------------------------------------------------
  describe('rawMeta preservation', () => {
    it('preserves original trace data in rawMeta', () => {
      const raw = makeOpenAIRaw('agent.start', { name: 'my-agent' });
      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        const rawMeta = result.events[0]!.rawMeta;
        expect(rawMeta).toBeDefined();
        expect(rawMeta!['normalizedBy']).toBe('openai-agents');
        expect(rawMeta!['originalType']).toBe('agent.start');
        expect(rawMeta!['traceId']).toBe('trace-001');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------
  describe('error handling', () => {
    it('returns error for unsupported OpenAI trace type', () => {
      const raw = makeOpenAIRaw('unknown.event_type', {});
      const result = adapter.normalize(raw);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Unsupported');
        expect(result.reason).toContain('trace type');
        expect(result.rawEvent).toBe(raw);
      }
    });

    it('returns error when type is missing from data', () => {
      const raw: RawVendorEvent = {
        vendor: 'openai-agents',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { trace_id: 'trace-001' },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Missing "type" field');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Parent event linking
  // -------------------------------------------------------------------------
  describe('parent event linking', () => {
    it('maps parent_span_id to parentEventId', () => {
      const raw: RawVendorEvent = {
        vendor: 'openai-agents',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        runId: 'b0000001-0000-4000-8000-000000000001',
        data: {
          type: 'tool_call.start',
          trace_id: 'trace-001',
          span_id: 'a0000001-0000-4000-8000-000000000002',
          parent_span_id: 'a0000001-0000-4000-8000-000000000001',
          timestamp: '2026-03-15T10:00:01.000Z',
          agent_name: 'test-agent',
          data: { name: 'search', arguments: {} },
        },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events[0]!.parentEventId).toBe(
          'a0000001-0000-4000-8000-000000000001',
        );
      }
    });
  });
});
