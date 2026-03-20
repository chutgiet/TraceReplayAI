import { describe, it, expect } from 'vitest';
import { GitHubCopilotAdapter } from '../github-copilot-adapter.js';
import type { RawVendorEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCopilotRaw(
  type: string,
  payload: Record<string, unknown> = {},
  overrides?: Partial<RawVendorEvent>,
): RawVendorEvent {
  return {
    vendor: 'github-copilot',
    tenantId: 'tenant-copilot-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    runId: 'b0000002-0000-4000-8000-000000000001',
    data: {
      type,
      sessionId: 'session-001',
      eventId: 'a0000002-0000-4000-8000-000000000001',
      timestamp: '2026-03-15T10:00:00.000Z',
      agentName: 'copilot-agent',
      payload,
      ...overrides?.data,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubCopilotAdapter', () => {
  const adapter = new GitHubCopilotAdapter();

  describe('vendorId', () => {
    it('should be "github-copilot"', () => {
      expect(adapter.vendorId).toBe('github-copilot');
    });
  });

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------
  describe('canHandle', () => {
    it('returns true for copilot.session.start', () => {
      expect(adapter.canHandle(makeCopilotRaw('copilot.session.start'))).toBe(true);
    });

    it('returns true for copilot.tool.invoke', () => {
      expect(adapter.canHandle(makeCopilotRaw('copilot.tool.invoke'))).toBe(true);
    });

    it('returns true for copilot.completion.request', () => {
      expect(adapter.canHandle(makeCopilotRaw('copilot.completion.request'))).toBe(true);
    });

    it('returns true for copilot.message', () => {
      expect(adapter.canHandle(makeCopilotRaw('copilot.message'))).toBe(true);
    });

    it('returns false for non-copilot types', () => {
      expect(adapter.canHandle(makeCopilotRaw('agent.start'))).toBe(false);
    });

    it('returns false for missing type', () => {
      const raw: RawVendorEvent = {
        vendor: 'github-copilot',
        tenantId: 'tenant-copilot-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { foo: 'bar' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // copilot.session.start → run.start
  // -----------------------------------------------------------------------
  describe('normalize: copilot.session.start → run.start', () => {
    it('maps session start with correct payload', () => {
      const raw = makeCopilotRaw('copilot.session.start', {
        sessionName: 'code-review-session',
        parentSessionId: 'parent-001',
        settings: { language: 'typescript' },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        const event = result.events[0]!;
        expect(event.type).toBe('run.start');
        expect(event.sourceFramework).toBe('github-copilot');
        expect(event.tenantId).toBe('tenant-copilot-001');
        expect(event.tags).toContain('github-copilot');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('code-review-session');
        expect(payload['triggerSource']).toBe('agent');
        expect(payload['parentRunId']).toBe('parent-001');
        expect(payload['configuration']).toEqual({ language: 'typescript' });
      }
    });

    it('falls back to agentName when sessionName missing', () => {
      const raw = makeCopilotRaw('copilot.session.start', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('copilot-agent');
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.session.end → run.end
  // -----------------------------------------------------------------------
  describe('normalize: copilot.session.end → run.end', () => {
    it('maps completed status', () => {
      const raw = makeCopilotRaw('copilot.session.end', {
        status: 'completed',
        durationMs: 2000,
        summary: 'Review completed',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('success');
        expect(payload['durationMs']).toBe(2000);
        expect(payload['summary']).toBe('Review completed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.tool.invoke → tool.call.start
  // -----------------------------------------------------------------------
  describe('normalize: copilot.tool.invoke → tool.call.start', () => {
    it('maps tool invocation', () => {
      const raw = makeCopilotRaw('copilot.tool.invoke', {
        toolName: 'read_file',
        toolId: 'tool-001',
        parameters: { path: '/src/index.ts' },
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('tool.call.start');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('read_file');
        expect(payload['toolId']).toBe('tool-001');
        expect(payload['inputParameters']).toEqual({ path: '/src/index.ts' });
      }
    });

    it('uses "unknown" for missing tool name', () => {
      const raw = makeCopilotRaw('copilot.tool.invoke', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('unknown');
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.tool.result → tool.call.end
  // -----------------------------------------------------------------------
  describe('normalize: copilot.tool.result → tool.call.end', () => {
    it('maps successful tool result', () => {
      const raw = makeCopilotRaw('copilot.tool.result', {
        toolName: 'read_file',
        output: { content: 'file contents here' },
        durationMs: 50,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('read_file');
        expect(payload['success']).toBe(true);
        expect(payload['durationMs']).toBe(50);
      }
    });

    it('marks failure when error present', () => {
      const raw = makeCopilotRaw('copilot.tool.result', {
        toolName: 'read_file',
        error: 'File not found',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['success']).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.completion.request → model.request
  // -----------------------------------------------------------------------
  describe('normalize: copilot.completion.request → model.request', () => {
    it('maps model request with github provider', () => {
      const raw = makeCopilotRaw('copilot.completion.request', {
        model: 'gpt-4o',
        inputTokens: 200,
        temperature: 0.3,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('github');
        expect(payload['modelId']).toBe('gpt-4o');
        expect(payload['inputTokens']).toBe(200);
        expect(payload['temperature']).toBe(0.3);
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.completion.response → model.response
  // -----------------------------------------------------------------------
  describe('normalize: copilot.completion.response → model.response', () => {
    it('maps model response', () => {
      const raw = makeCopilotRaw('copilot.completion.response', {
        model: 'gpt-4o',
        outputTokens: 80,
        inputTokens: 200,
        latencyMs: 600,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('github');
        expect(payload['outputTokens']).toBe(80);
        expect(payload['latencyMs']).toBe(600);
      }
    });
  });

  // -----------------------------------------------------------------------
  // copilot.message → prompt.output
  // -----------------------------------------------------------------------
  describe('normalize: copilot.message → prompt.output', () => {
    it('maps output message', () => {
      const raw = makeCopilotRaw('copilot.message', {
        content: 'Here is the refactored code.',
        tokenCount: 15,
        finishReason: 'stop',
        model: 'gpt-4o',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['content']).toBe('Here is the refactored code.');
        expect(payload['tokenCount']).toBe(15);
        expect(payload['finishReason']).toBe('stop');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Session ID mapping
  // -----------------------------------------------------------------------
  describe('field mapping', () => {
    it('uses sessionId as traceId for runId', () => {
      const raw = makeCopilotRaw('copilot.session.start', {
        sessionName: 'test',
      });
      // Remove explicit runId so it falls back to sessionId (traceId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (raw as any).runId;

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        expect(result.events[0]!.runId).toBe('session-001');
      }
    });

    it('uses eventId as event id', () => {
      const raw = makeCopilotRaw('copilot.session.start', {});

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        expect(result.events[0]!.id).toBe('a0000002-0000-4000-8000-000000000001');
      }
    });
  });

  // -----------------------------------------------------------------------
  // rawMeta preservation
  // -----------------------------------------------------------------------
  describe('rawMeta preservation', () => {
    it('preserves original trace data in rawMeta', () => {
      const raw = makeCopilotRaw('copilot.session.start', { sessionName: 'test' });
      const result = adapter.normalize(raw);

      if (result.status === 'success') {
        const rawMeta = result.events[0]!.rawMeta;
        expect(rawMeta).toBeDefined();
        expect(rawMeta!['normalizedBy']).toBe('github-copilot');
        expect(rawMeta!['originalType']).toBe('copilot.session.start');
        expect(rawMeta!['traceId']).toBe('session-001');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('returns error for unsupported type', () => {
      const raw = makeCopilotRaw('copilot.unknown.action', {});
      const result = adapter.normalize(raw);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Unsupported');
        expect(result.reason).toContain('trace type');
      }
    });

    it('returns error when type is missing', () => {
      const raw: RawVendorEvent = {
        vendor: 'github-copilot',
        tenantId: 'tenant-copilot-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { sessionId: 'session-001' },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Missing "type" field');
      }
    });
  });
});
