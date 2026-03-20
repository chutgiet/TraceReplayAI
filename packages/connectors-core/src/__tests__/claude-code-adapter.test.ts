import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from '../claude-code-adapter.js';
import type { RawVendorEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClaudeRaw(
  type: string,
  content: Record<string, unknown> = {},
  overrides?: Partial<RawVendorEvent>,
): RawVendorEvent {
  return {
    vendor: 'claude-code',
    tenantId: 'tenant-claude-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    runId: 'b0000003-0000-4000-8000-000000000001',
    data: {
      type,
      conversation_id: 'conv-001',
      event_id: 'a0000003-0000-4000-8000-000000000001',
      timestamp: '2026-03-15T10:00:00.000Z',
      agent: 'claude-code-agent',
      content,
      ...overrides?.data,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter();

  describe('vendorId', () => {
    it('should be "claude-code"', () => {
      expect(adapter.vendorId).toBe('claude-code');
    });
  });

  // -----------------------------------------------------------------------
  // canHandle
  // -----------------------------------------------------------------------
  describe('canHandle', () => {
    it('returns true for conversation.start', () => {
      expect(adapter.canHandle(makeClaudeRaw('conversation.start'))).toBe(true);
    });

    it('returns true for tool_use.begin', () => {
      expect(adapter.canHandle(makeClaudeRaw('tool_use.begin'))).toBe(true);
    });

    it('returns true for inference.request', () => {
      expect(adapter.canHandle(makeClaudeRaw('inference.request'))).toBe(true);
    });

    it('returns true for assistant.message', () => {
      expect(adapter.canHandle(makeClaudeRaw('assistant.message'))).toBe(true);
    });

    it('returns true for permission.check', () => {
      expect(adapter.canHandle(makeClaudeRaw('permission.check'))).toBe(true);
    });

    it('returns false for non-claude types', () => {
      expect(adapter.canHandle(makeClaudeRaw('agent.start'))).toBe(false);
    });

    it('returns false for missing type', () => {
      const raw: RawVendorEvent = {
        vendor: 'claude-code',
        tenantId: 'tenant-claude-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { foo: 'bar' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // conversation.start → run.start
  // -----------------------------------------------------------------------
  describe('normalize: conversation.start → run.start', () => {
    it('maps conversation start with correct payload', () => {
      const raw = makeClaudeRaw('conversation.start', {
        conversation_name: 'debug-session',
        parent_conversation_id: 'parent-conv-001',
        config: { maxTokens: 4096 },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        const event = result.events[0]!;
        expect(event.type).toBe('run.start');
        expect(event.sourceFramework).toBe('claude-code');
        expect(event.tenantId).toBe('tenant-claude-001');
        expect(event.tags).toContain('claude-code');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('debug-session');
        expect(payload['triggerSource']).toBe('agent');
        expect(payload['parentRunId']).toBe('parent-conv-001');
        expect(payload['configuration']).toEqual({ maxTokens: 4096 });
      }
    });

    it('falls back to agent name when conversation_name missing', () => {
      const raw = makeClaudeRaw('conversation.start', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['runName']).toBe('claude-code-agent');
      }
    });
  });

  // -----------------------------------------------------------------------
  // conversation.end → run.end
  // -----------------------------------------------------------------------
  describe('normalize: conversation.end → run.end', () => {
    it('maps completed status', () => {
      const raw = makeClaudeRaw('conversation.end', {
        status: 'completed',
        duration_ms: 3000,
        summary: 'Bug fixed',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('success');
        expect(payload['durationMs']).toBe(3000);
        expect(payload['summary']).toBe('Bug fixed');
      }
    });

    it('maps failed status', () => {
      const raw = makeClaudeRaw('conversation.end', { status: 'failed' });
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['status']).toBe('failure');
      }
    });
  });

  // -----------------------------------------------------------------------
  // tool_use.begin → tool.call.start
  // -----------------------------------------------------------------------
  describe('normalize: tool_use.begin → tool.call.start', () => {
    it('maps tool use with input parameters', () => {
      const raw = makeClaudeRaw('tool_use.begin', {
        tool_name: 'bash',
        tool_use_id: 'tu-001',
        input: { command: 'ls -la' },
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('tool.call.start');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('bash');
        expect(payload['toolId']).toBe('tu-001');
        expect(payload['inputParameters']).toEqual({ command: 'ls -la' });
      }
    });

    it('uses "unknown" for missing tool name', () => {
      const raw = makeClaudeRaw('tool_use.begin', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('unknown');
      }
    });
  });

  // -----------------------------------------------------------------------
  // tool_use.complete → tool.call.end
  // -----------------------------------------------------------------------
  describe('normalize: tool_use.complete → tool.call.end', () => {
    it('maps successful tool completion', () => {
      const raw = makeClaudeRaw('tool_use.complete', {
        tool_name: 'bash',
        output: { stdout: 'total 32', exitCode: 0 },
        duration_ms: 100,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('bash');
        expect(payload['success']).toBe(true);
        expect(payload['durationMs']).toBe(100);
      }
    });

    it('marks failure when is_error is true', () => {
      const raw = makeClaudeRaw('tool_use.complete', {
        tool_name: 'bash',
        is_error: true,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['success']).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // tool_use.failed → tool.call.error
  // -----------------------------------------------------------------------
  describe('normalize: tool_use.failed → tool.call.error', () => {
    it('maps tool failure', () => {
      const raw = makeClaudeRaw('tool_use.failed', {
        tool_name: 'bash',
        error_type: 'PermissionDenied',
        error_message: 'Command not allowed',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['toolName']).toBe('bash');
        expect(payload['errorType']).toBe('PermissionDenied');
        expect(payload['errorMessage']).toBe('Command not allowed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // inference.request → model.request
  // -----------------------------------------------------------------------
  describe('normalize: inference.request → model.request', () => {
    it('maps model request with anthropic provider', () => {
      const raw = makeClaudeRaw('inference.request', {
        model: 'claude-sonnet-4-20250514',
        input_tokens: 300,
        temperature: 0.5,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('anthropic');
        expect(payload['modelId']).toBe('claude-sonnet-4-20250514');
        expect(payload['inputTokens']).toBe(300);
        expect(payload['temperature']).toBe(0.5);
      }
    });
  });

  // -----------------------------------------------------------------------
  // inference.response → model.response
  // -----------------------------------------------------------------------
  describe('normalize: inference.response → model.response', () => {
    it('maps model response', () => {
      const raw = makeClaudeRaw('inference.response', {
        model: 'claude-sonnet-4-20250514',
        output_tokens: 120,
        input_tokens: 300,
        latency_ms: 900,
        cost: 0.003,
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['modelProvider']).toBe('anthropic');
        expect(payload['outputTokens']).toBe(120);
        expect(payload['latencyMs']).toBe(900);
        expect(payload['cost']).toBe(0.003);
      }
    });
  });

  // -----------------------------------------------------------------------
  // assistant.message → prompt.output
  // -----------------------------------------------------------------------
  describe('normalize: assistant.message → prompt.output', () => {
    it('maps assistant message', () => {
      const raw = makeClaudeRaw('assistant.message', {
        text: 'I found the bug in line 42.',
        token_count: 8,
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['content']).toBe('I found the bug in line 42.');
        expect(payload['tokenCount']).toBe(8);
        expect(payload['finishReason']).toBe('end_turn');
        expect(payload['modelId']).toBe('claude-sonnet-4-20250514');
      }
    });
  });

  // -----------------------------------------------------------------------
  // permission.check → policy.evaluated
  // -----------------------------------------------------------------------
  describe('normalize: permission.check → policy.evaluated', () => {
    it('maps permission check', () => {
      const raw = makeClaudeRaw('permission.check', {
        permission_id: 'perm-001',
        permission_name: 'file-write',
        result: 'allow',
        details: 'User granted write access',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const event = result.events[0]!;
        expect(event.type).toBe('policy.evaluated');

        const payload = event.payload as Record<string, unknown>;
        expect(payload['policyId']).toBe('perm-001');
        expect(payload['policyName']).toBe('file-write');
        expect(payload['result']).toBe('pass');
        expect(payload['details']).toBe('User granted write access');
      }
    });

    it('maps denied permission to fail', () => {
      const raw = makeClaudeRaw('permission.check', {
        permission_id: 'perm-002',
        permission_name: 'network-access',
        result: 'denied',
      });

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        const payload = result.events[0]!.payload as Record<string, unknown>;
        expect(payload['result']).toBe('fail');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Field mapping
  // -----------------------------------------------------------------------
  describe('field mapping', () => {
    it('uses conversation_id as traceId for runId', () => {
      const raw = makeClaudeRaw('conversation.start', {
        conversation_name: 'test',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (raw as any).runId;

      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        expect(result.events[0]!.runId).toBe('conv-001');
      }
    });

    it('uses event_id as event id', () => {
      const raw = makeClaudeRaw('conversation.start', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        expect(result.events[0]!.id).toBe('a0000003-0000-4000-8000-000000000001');
      }
    });

    it('uses agent field for sourceAgent', () => {
      const raw = makeClaudeRaw('conversation.start', {});
      const result = adapter.normalize(raw);
      if (result.status === 'success') {
        expect(result.events[0]!.sourceAgent).toBe('claude-code-agent');
      }
    });
  });

  // -----------------------------------------------------------------------
  // rawMeta preservation
  // -----------------------------------------------------------------------
  describe('rawMeta preservation', () => {
    it('preserves original trace data in rawMeta', () => {
      const raw = makeClaudeRaw('conversation.start', {});
      const result = adapter.normalize(raw);

      if (result.status === 'success') {
        const rawMeta = result.events[0]!.rawMeta;
        expect(rawMeta).toBeDefined();
        expect(rawMeta!['normalizedBy']).toBe('claude-code');
        expect(rawMeta!['originalType']).toBe('conversation.start');
        expect(rawMeta!['traceId']).toBe('conv-001');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('returns error for unsupported type', () => {
      const raw = makeClaudeRaw('unknown.action', {});
      const result = adapter.normalize(raw);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Unsupported');
        expect(result.reason).toContain('trace type');
      }
    });

    it('returns error when type is missing', () => {
      const raw: RawVendorEvent = {
        vendor: 'claude-code',
        tenantId: 'tenant-claude-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { conversation_id: 'conv-001' },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Missing "type" field');
      }
    });
  });
});
