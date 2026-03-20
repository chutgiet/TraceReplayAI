import { describe, it, expect, beforeEach } from 'vitest';
import type {
  TraceReplayEvent,
  EventId,
  RunId,
  TenantId,
} from '@tracereplay/event-schema';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import { buildTimeline } from '../timeline-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_ID = 'run-001' as RunId;
const TENANT_ID = 'tenant-001' as TenantId;

let eventCounter = 0;

function makeEvent<T extends TraceReplayEvent['type']>(
  type: T,
  timestamp: string,
  payload: Extract<TraceReplayEvent, { type: T }>['payload'],
  overrides?: Partial<TraceReplayEvent>,
): Extract<TraceReplayEvent, { type: T }> {
  eventCounter += 1;
  return {
    id: `evt-${String(eventCounter).padStart(4, '0')}` as EventId,
    runId: RUN_ID,
    type,
    timestamp,
    tenantId: TENANT_ID,
    sourceAgent: 'test-agent',
    schemaVersion: SCHEMA_VERSION,
    payload,
    ...overrides,
  } as Extract<TraceReplayEvent, { type: T }>;
}

function resetCounter(): void {
  eventCounter = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildTimeline', () => {
  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------
  describe('empty input', () => {
    it('returns an empty timeline for zero events', () => {
      const result = buildTimeline([]);
      expect(result.entries).toHaveLength(0);
      expect(result.gaps).toHaveLength(0);
      expect(result.summary.eventCount).toBe(0);
      expect(result.summary.hasGaps).toBe(false);
      expect(result.summary.hasErrors).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Simple successful run
  // -----------------------------------------------------------------------
  describe('simple successful run', () => {
    beforeEach(resetCounter);

    it('orders events by timestamp into a timeline', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', { runName: 'simple' }),
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'hello',
        }),
        makeEvent('prompt.output', '2026-03-15T10:00:02.000Z', {
          content: 'world',
        }),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', {
          status: 'success',
          durationMs: 3000,
        }),
      ];

      const result = buildTimeline(events);

      expect(result.entries).toHaveLength(4);
      expect(result.entries[0]!.event.type).toBe('run.start');
      expect(result.entries[1]!.event.type).toBe('prompt.input');
      expect(result.entries[2]!.event.type).toBe('prompt.output');
      expect(result.entries[3]!.event.type).toBe('run.end');
      expect(result.entries[0]!.index).toBe(0);
      expect(result.entries[3]!.index).toBe(3);
    });

    it('computes summary correctly', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', {
          status: 'success',
        }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.runId).toBe(RUN_ID);
      expect(summary.tenantId).toBe(TENANT_ID);
      expect(summary.eventCount).toBe(2);
      expect(summary.status).toBe('success');
      expect(summary.durationMs).toBe(5000);
      expect(summary.hasGaps).toBe(false);
      expect(summary.hasErrors).toBe(false);
      expect(summary.toolCount).toBe(0);
      expect(summary.eventTypeCounts['run.start']).toBe(1);
      expect(summary.eventTypeCounts['run.end']).toBe(1);
    });

    it('has no gaps for a complete run', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('run.end', '2026-03-15T10:00:01.000Z', { status: 'success' }),
      ];
      const { gaps } = buildTimeline(events);
      expect(gaps).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Out-of-order events
  // -----------------------------------------------------------------------
  describe('out-of-order events', () => {
    beforeEach(resetCounter);

    it('sorts shuffled events into correct chronological order', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'success' }),
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'hi',
        }),
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('prompt.output', '2026-03-15T10:00:02.000Z', {
          content: 'hey',
        }),
      ];

      const result = buildTimeline(events);

      expect(result.entries[0]!.event.type).toBe('run.start');
      expect(result.entries[1]!.event.type).toBe('prompt.input');
      expect(result.entries[2]!.event.type).toBe('prompt.output');
      expect(result.entries[3]!.event.type).toBe('run.end');
    });

    it('uses sequence number as tiebreaker for identical timestamps', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('prompt.output', '2026-03-15T10:00:01.000Z', { content: 'b' }, { sequence: 2 }),
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'a',
        }, { sequence: 1 }),
      ];

      const result = buildTimeline(events);

      expect(result.entries[0]!.event.type).toBe('prompt.input');
      expect(result.entries[1]!.event.type).toBe('prompt.output');
    });
  });

  // -----------------------------------------------------------------------
  // Multi-tool run
  // -----------------------------------------------------------------------
  describe('multi-tool run', () => {
    beforeEach(resetCounter);

    it('counts distinct tools and tracks tool events', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('tool.call.start', '2026-03-15T10:00:01.000Z', {
          toolName: 'search',
          inputParameters: { query: 'test' },
        }),
        makeEvent('tool.call.end', '2026-03-15T10:00:02.000Z', {
          toolName: 'search',
          output: { results: [] },
          success: true,
        }),
        makeEvent('tool.call.start', '2026-03-15T10:00:03.000Z', {
          toolName: 'calculator',
          inputParameters: { expr: '1+1' },
        }),
        makeEvent('tool.call.end', '2026-03-15T10:00:04.000Z', {
          toolName: 'calculator',
          output: 2,
          success: true,
        }),
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', { status: 'success' }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.toolCount).toBe(2);
      expect(summary.eventTypeCounts['tool.call.start']).toBe(2);
      expect(summary.eventTypeCounts['tool.call.end']).toBe(2);
    });

    it('computes paired duration for tool calls', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('tool.call.start', '2026-03-15T10:00:01.000Z', {
          toolName: 'search',
          inputParameters: {},
        }),
        makeEvent('tool.call.end', '2026-03-15T10:00:03.500Z', {
          toolName: 'search',
          output: null,
          success: true,
        }),
        makeEvent('run.end', '2026-03-15T10:00:04.000Z', { status: 'success' }),
      ];

      const result = buildTimeline(events);

      // The tool.call.start entry should have a computed durationMs
      const toolStart = result.entries.find((e) => e.event.type === 'tool.call.start');
      expect(toolStart?.durationMs).toBe(2500);
    });
  });

  // -----------------------------------------------------------------------
  // Causal linking (parentEventId)
  // -----------------------------------------------------------------------
  describe('causal linking', () => {
    beforeEach(resetCounter);

    it('resolves parent-child relationships and depth', () => {
      const parentId = 'evt-parent' as EventId;
      const childId = 'evt-child' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}, { id: parentId }),
        makeEvent(
          'tool.call.start',
          '2026-03-15T10:00:01.000Z',
          { toolName: 'fetch', inputParameters: {} },
          { id: childId, parentEventId: parentId },
        ),
        makeEvent(
          'tool.call.end',
          '2026-03-15T10:00:02.000Z',
          { toolName: 'fetch', output: null, success: true },
          { parentEventId: parentId },
        ),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'success' }),
      ];

      const result = buildTimeline(events);

      // Parent (run.start) has depth 0 and lists children.
      const parent = result.entries.find((e) => e.event.id === parentId)!;
      expect(parent.depth).toBe(0);
      expect(parent.childEventIds).toContain(childId);

      // Child (tool.call.start) has depth 1.
      const child = result.entries.find((e) => e.event.id === childId)!;
      expect(child.depth).toBe(1);
    });

    it('handles nested causal chains', () => {
      const rootId = 'evt-root' as EventId;
      const midId = 'evt-mid' as EventId;
      const leafId = 'evt-leaf' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}, { id: rootId }),
        makeEvent(
          'tool.call.start',
          '2026-03-15T10:00:01.000Z',
          { toolName: 'outer', inputParameters: {} },
          { id: midId, parentEventId: rootId },
        ),
        makeEvent(
          'tool.call.start',
          '2026-03-15T10:00:02.000Z',
          { toolName: 'inner', inputParameters: {} },
          { id: leafId, parentEventId: midId },
        ),
        makeEvent(
          'tool.call.end',
          '2026-03-15T10:00:03.000Z',
          { toolName: 'inner', output: null, success: true },
        ),
        makeEvent(
          'tool.call.end',
          '2026-03-15T10:00:04.000Z',
          { toolName: 'outer', output: null, success: true },
        ),
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', { status: 'success' }),
      ];

      const result = buildTimeline(events);

      expect(result.entries.find((e) => e.event.id === rootId)!.depth).toBe(0);
      expect(result.entries.find((e) => e.event.id === midId)!.depth).toBe(1);
      expect(result.entries.find((e) => e.event.id === leafId)!.depth).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Gap detection
  // -----------------------------------------------------------------------
  describe('gap detection', () => {
    beforeEach(resetCounter);

    it('detects missing run.start', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'hi',
        }),
        makeEvent('run.end', '2026-03-15T10:00:02.000Z', { status: 'success' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'missing_run_start')).toBe(true);
    });

    it('detects missing run.end', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'hi',
        }),
      ];

      const { gaps, summary } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'missing_run_end')).toBe(true);
      expect(summary.hasGaps).toBe(true);
      expect(summary.status).toBeUndefined();
    });

    it('detects unclosed tool call', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('tool.call.start', '2026-03-15T10:00:01.000Z', {
          toolName: 'fetch',
          inputParameters: {},
        }),
        // Missing tool.call.end
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'failure' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'unclosed_tool_call')).toBe(true);
    });

    it('detects orphan tool.call.end', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        // No tool.call.start
        makeEvent('tool.call.end', '2026-03-15T10:00:02.000Z', {
          toolName: 'mystery',
          output: null,
          success: true,
        }),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'success' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'orphan_tool_end')).toBe(true);
    });

    it('detects unclosed approval', () => {
      const approvalId = 'evt-approval' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent(
          'approval.requested',
          '2026-03-15T10:00:01.000Z',
          {
            approvalType: 'human',
            requestedAction: 'deploy',
            requestedBy: 'agent-1',
          },
          { id: approvalId },
        ),
        // No approval.granted or approval.denied
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', { status: 'success' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'unclosed_approval')).toBe(true);
      const gap = gaps.find((g) => g.type === 'unclosed_approval')!;
      expect(gap.relatedEventIds).toContain(approvalId);
    });

    it('does not flag a resolved approval', () => {
      const approvalId = 'evt-approval-ok' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent(
          'approval.requested',
          '2026-03-15T10:00:01.000Z',
          {
            approvalType: 'human',
            requestedAction: 'deploy',
            requestedBy: 'agent-1',
          },
          { id: approvalId },
        ),
        makeEvent(
          'approval.granted',
          '2026-03-15T10:00:02.000Z',
          {
            approvalType: 'human',
            decidedBy: 'admin-1',
          },
          { parentEventId: approvalId },
        ),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'success' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'unclosed_approval')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Error runs
  // -----------------------------------------------------------------------
  describe('error runs', () => {
    beforeEach(resetCounter);

    it('detects errors in summary.hasErrors', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('run.error', '2026-03-15T10:00:01.000Z', {
          errorType: 'RateLimit',
          errorMessage: 'Too many requests',
          fatal: false,
        }),
        makeEvent('run.end', '2026-03-15T10:00:02.000Z', { status: 'failure' }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.hasErrors).toBe(true);
      expect(summary.status).toBe('failure');
    });

    it('detects tool.call.error as an error run', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('tool.call.start', '2026-03-15T10:00:01.000Z', {
          toolName: 'db-query',
          inputParameters: {},
        }),
        makeEvent('tool.call.error', '2026-03-15T10:00:02.000Z', {
          toolName: 'db-query',
          errorType: 'ConnectionError',
          errorMessage: 'DB unreachable',
        }),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'failure' }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.hasErrors).toBe(true);
    });

    it('detects side_effect.failed as an error', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('side_effect.failed', '2026-03-15T10:00:01.000Z', {
          effectType: 'email',
          targetSystem: 'smtp',
          description: 'Send notification',
          errorType: 'SmtpError',
          errorMessage: 'Connection refused',
        }),
        makeEvent('run.end', '2026-03-15T10:00:02.000Z', { status: 'failure' }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.hasErrors).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Partial telemetry
  // -----------------------------------------------------------------------
  describe('partial telemetry', () => {
    beforeEach(resetCounter);

    it('handles a run with only mid-run events (no start, no end)', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'partial',
        }),
        makeEvent('prompt.output', '2026-03-15T10:00:02.000Z', {
          content: 'response',
        }),
      ];

      const { gaps, summary } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'missing_run_start')).toBe(true);
      expect(gaps.some((g) => g.type === 'missing_run_end')).toBe(true);
      expect(summary.hasGaps).toBe(true);
      expect(summary.status).toBeUndefined();
    });

    it('handles a single event', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', { runName: 'single' }),
      ];

      const result = buildTimeline(events);

      expect(result.entries).toHaveLength(1);
      expect(result.summary.eventCount).toBe(1);
      expect(result.gaps.some((g) => g.type === 'missing_run_end')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Event type counts
  // -----------------------------------------------------------------------
  describe('event type counts', () => {
    beforeEach(resetCounter);

    it('counts all event types correctly', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('model.request', '2026-03-15T10:00:01.000Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
        }),
        makeEvent('model.response', '2026-03-15T10:00:02.000Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
          latencyMs: 500,
        }),
        makeEvent('model.request', '2026-03-15T10:00:03.000Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
        }),
        makeEvent('model.response', '2026-03-15T10:00:04.000Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
        }),
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', { status: 'success' }),
      ];

      const { summary } = buildTimeline(events);

      expect(summary.eventTypeCounts['model.request']).toBe(2);
      expect(summary.eventTypeCounts['model.response']).toBe(2);
      expect(summary.eventTypeCounts['run.start']).toBe(1);
      expect(summary.eventTypeCounts['run.end']).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Timeline immutability
  // -----------------------------------------------------------------------
  describe('immutability', () => {
    beforeEach(resetCounter);

    it('does not mutate the input array', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.end', '2026-03-15T10:00:01.000Z', { status: 'success' }),
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
      ];
      const originalFirst = events[0]!.type;

      buildTimeline(events);

      // Original array order should be preserved.
      expect(events[0]!.type).toBe(originalFirst);
    });
  });

  // -----------------------------------------------------------------------
  // Complex realistic run
  // -----------------------------------------------------------------------
  describe('realistic multi-step run', () => {
    beforeEach(resetCounter);

    it('produces a correct timeline for a full agent execution', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {
          runName: 'customer-support',
          triggerSource: 'api',
        }),
        makeEvent('context.retrieved', '2026-03-15T10:00:00.500Z', {
          source: 'vector_db',
          query: 'return policy',
          snippetCount: 3,
        }),
        makeEvent('context.injected', '2026-03-15T10:00:00.600Z', {
          source: 'vector_db',
          tokenCount: 450,
        }),
        makeEvent('prompt.input', '2026-03-15T10:00:01.000Z', {
          role: 'user',
          content: 'I want to return my order',
          tokenCount: 12,
        }),
        makeEvent('model.request', '2026-03-15T10:00:01.100Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
          inputTokens: 462,
          temperature: 0.7,
        }),
        makeEvent('model.response', '2026-03-15T10:00:02.500Z', {
          modelProvider: 'openai',
          modelId: 'gpt-4',
          outputTokens: 85,
          latencyMs: 1400,
        }),
        makeEvent('prompt.output', '2026-03-15T10:00:02.600Z', {
          content: 'I can help with that. Let me look up your order.',
          tokenCount: 85,
        }),
        makeEvent('tool.call.start', '2026-03-15T10:00:03.000Z', {
          toolName: 'order-lookup',
          inputParameters: { customerId: 'cust-123' },
        }),
        makeEvent('tool.call.end', '2026-03-15T10:00:04.000Z', {
          toolName: 'order-lookup',
          output: { orderId: 'ord-456', status: 'delivered' },
          success: true,
          durationMs: 1000,
        }),
        makeEvent('side_effect.executed', '2026-03-15T10:00:04.500Z', {
          effectType: 'api_call',
          targetSystem: 'returns-service',
          description: 'Initiate return for order ord-456',
          reversible: true,
        }),
        makeEvent('policy.evaluated', '2026-03-15T10:00:04.600Z', {
          policyId: 'pol-return-eligibility',
          policyName: 'Return Eligibility Check',
          result: 'pass',
        }),
        makeEvent('annotation', '2026-03-15T10:00:04.700Z', {
          key: 'sentiment',
          value: 'neutral',
          annotatedBy: 'sentiment-analyzer',
        }),
        makeEvent('run.end', '2026-03-15T10:00:05.000Z', {
          status: 'success',
          durationMs: 5000,
          summary: 'Return initiated for order ord-456',
        }),
      ];

      const result = buildTimeline(events);

      expect(result.entries).toHaveLength(13);
      expect(result.gaps).toHaveLength(0);
      expect(result.summary.status).toBe('success');
      expect(result.summary.toolCount).toBe(1);
      expect(result.summary.hasErrors).toBe(false);
      expect(result.summary.durationMs).toBe(5000);
      expect(result.summary.eventCount).toBe(13);

      // Verify chronological order
      for (let i = 1; i < result.entries.length; i++) {
        const prev = result.entries[i - 1]!.event.timestamp;
        const curr = result.entries[i]!.event.timestamp;
        expect(curr >= prev).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Tool call error closes the call
  // -----------------------------------------------------------------------
  describe('tool.call.error closes tool call', () => {
    beforeEach(resetCounter);

    it('does not flag unclosed_tool_call when tool.call.error closes it', () => {
      const events: TraceReplayEvent[] = [
        makeEvent('run.start', '2026-03-15T10:00:00.000Z', {}),
        makeEvent('tool.call.start', '2026-03-15T10:00:01.000Z', {
          toolName: 'api-call',
          inputParameters: {},
        }),
        makeEvent('tool.call.error', '2026-03-15T10:00:02.000Z', {
          toolName: 'api-call',
          errorType: 'Timeout',
          errorMessage: 'Request timed out',
        }),
        makeEvent('run.end', '2026-03-15T10:00:03.000Z', { status: 'failure' }),
      ];

      const { gaps } = buildTimeline(events);

      expect(gaps.some((g) => g.type === 'unclosed_tool_call')).toBe(false);
    });
  });
});
