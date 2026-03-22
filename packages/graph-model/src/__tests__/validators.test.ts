import { describe, it, expect } from 'vitest';
import type { EventId, RunId, TenantId } from '@tracereplay/event-schema';
import {
  nodeIdSchema,
  edgeIdSchema,
  lineageNodeTypeSchema,
  lineageEdgeTypeSchema,
  runNodeMetaSchema,
  eventNodeMetaSchema,
  sideEffectNodeMetaSchema,
  externalSystemNodeMetaSchema,
  causalEdgeMetaSchema,
  temporalEdgeMetaSchema,
  producesEdgeMetaSchema,
  delegationEdgeMetaSchema,
  dataFlowEdgeMetaSchema,
  lineageNodeSchema,
  lineageEdgeSchema,
  lineageGraphSummarySchema,
  integrityIssueSchema,
  serializedLineageGraphSchema,
  validateSerializedGraph,
  validateNode,
  validateEdge,
} from '../validators.js';
import { buildLineageGraph, resetEdgeCounter } from '../graph-builder.js';
import { serializeGraph } from '../serialization.js';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { NodeId, EdgeId } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT = 'tenant-v-001' as TenantId;
const RUN_ID = 'run-val-001' as RunId;
let seq = 0;

function makeEvent(
  overrides: Partial<TraceReplayEvent> & { type: TraceReplayEvent['type']; payload: Record<string, unknown> },
): TraceReplayEvent {
  seq++;
  return {
    id: overrides.id ?? (`vevt-${String(seq).padStart(4, '0')}` as EventId),
    runId: overrides.runId ?? RUN_ID,
    type: overrides.type,
    timestamp: overrides.timestamp ?? new Date(Date.now() + seq * 1000).toISOString(),
    tenantId: overrides.tenantId ?? TENANT,
    sourceAgent: overrides.sourceAgent ?? 'test-agent',
    schemaVersion: overrides.schemaVersion ?? '1.0.0',
    payload: overrides.payload,
    sequence: overrides.sequence ?? seq,
    parentEventId: overrides.parentEventId,
    sourceFramework: overrides.sourceFramework,
    tags: overrides.tags,
    rawMeta: overrides.rawMeta,
  } as TraceReplayEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validators', () => {
  // -----------------------------------------------------------------------
  // ID schemas
  // -----------------------------------------------------------------------

  describe('nodeIdSchema', () => {
    it('validates a valid node ID', () => {
      expect(nodeIdSchema.safeParse('event:e1').success).toBe(true);
    });

    it('rejects empty string', () => {
      expect(nodeIdSchema.safeParse('').success).toBe(false);
    });

    it('rejects non-string', () => {
      expect(nodeIdSchema.safeParse(123).success).toBe(false);
    });
  });

  describe('edgeIdSchema', () => {
    it('validates a valid edge ID', () => {
      expect(edgeIdSchema.safeParse('edge-001').success).toBe(true);
    });

    it('rejects empty string', () => {
      expect(edgeIdSchema.safeParse('').success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Type discriminator schemas
  // -----------------------------------------------------------------------

  describe('lineageNodeTypeSchema', () => {
    it.each(['run', 'event', 'side_effect', 'external_system'] as const)(
      'accepts "%s"',
      (type) => {
        expect(lineageNodeTypeSchema.safeParse(type).success).toBe(true);
      },
    );

    it('rejects invalid type', () => {
      expect(lineageNodeTypeSchema.safeParse('banana').success).toBe(false);
    });
  });

  describe('lineageEdgeTypeSchema', () => {
    it.each(['causal', 'temporal', 'produces', 'delegation', 'data_flow'] as const)(
      'accepts "%s"',
      (type) => {
        expect(lineageEdgeTypeSchema.safeParse(type).success).toBe(true);
      },
    );

    it('rejects invalid type', () => {
      expect(lineageEdgeTypeSchema.safeParse('invalid').success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Node metadata schemas
  // -----------------------------------------------------------------------

  describe('runNodeMetaSchema', () => {
    it('accepts valid run meta', () => {
      const result = runNodeMetaSchema.safeParse({
        agentId: 'test-agent',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional fields', () => {
      const result = runNodeMetaSchema.safeParse({
        agentId: 'test-agent',
        runName: 'my-run',
        parentRunId: 'parent-run',
        startTime: '2026-01-01T00:00:00Z',
        endTime: '2026-01-01T00:01:00Z',
        status: 'success',
        durationMs: 60000,
        triggerSource: 'api',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = runNodeMetaSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('eventNodeMetaSchema', () => {
    it('accepts valid event meta', () => {
      const result = eventNodeMetaSchema.safeParse({
        eventType: 'run.start',
        sourceAgent: 'test-agent',
        timestamp: '2026-01-01T00:00:00Z',
        sequence: 1,
        label: 'Run started',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing eventType', () => {
      const result = eventNodeMetaSchema.safeParse({
        sourceAgent: 'test-agent',
        timestamp: '2026-01-01T00:00:00Z',
        sequence: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sideEffectNodeMetaSchema', () => {
    it('accepts valid side-effect meta', () => {
      const result = sideEffectNodeMetaSchema.safeParse({
        effectType: 'api_call',
        targetSystem: 'slack',
        description: 'Notify channel',
        reversible: true,
        success: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('externalSystemNodeMetaSchema', () => {
    it('accepts valid external system meta', () => {
      const result = externalSystemNodeMetaSchema.safeParse({
        systemName: 'slack',
        effectCount: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge metadata schemas
  // -----------------------------------------------------------------------

  describe('causalEdgeMetaSchema', () => {
    it('accepts valid causal meta', () => {
      const result = causalEdgeMetaSchema.safeParse({
        parentEventId: 'e1',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('temporalEdgeMetaSchema', () => {
    it('accepts valid temporal meta', () => {
      const result = temporalEdgeMetaSchema.safeParse({
        gapMs: 1000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('producesEdgeMetaSchema', () => {
    it('accepts valid produces meta', () => {
      const result = producesEdgeMetaSchema.safeParse({
        effectType: 'api_call',
        targetSystem: 'slack',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('delegationEdgeMetaSchema', () => {
    it('accepts valid delegation meta', () => {
      const result = delegationEdgeMetaSchema.safeParse({
        parentRunId: 'run-parent',
        childRunId: 'run-child',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('dataFlowEdgeMetaSchema', () => {
    it('accepts valid data flow meta', () => {
      const result = dataFlowEdgeMetaSchema.safeParse({
        sourceEventType: 'context.retrieved',
        targetEventType: 'context.injected',
        description: 'Retrieved context flows into prompt injection',
      });
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Composite schemas
  // -----------------------------------------------------------------------

  describe('lineageNodeSchema', () => {
    it('validates a complete event node', () => {
      const result = lineageNodeSchema.safeParse({
        id: 'event:e1',
        type: 'event',
        tenantId: 'tenant-001',
        runId: 'run-001',
        meta: {
          eventType: 'run.start',
          sourceAgent: 'test-agent',
          timestamp: '2026-01-01T00:00:00Z',
          sequence: 1,
        },
        sourceEventId: 'e1',
      });
      expect(result.success).toBe(true);
    });

    it('rejects node with missing id', () => {
      const result = lineageNodeSchema.safeParse({
        type: 'event',
        tenantId: 'tenant-001',
        meta: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('lineageEdgeSchema', () => {
    it('validates a complete edge', () => {
      const result = lineageEdgeSchema.safeParse({
        id: 'edge-001',
        type: 'causal',
        source: 'event:e1',
        target: 'event:e2',
        meta: { parentEventId: 'e1' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects edge with missing source', () => {
      const result = lineageEdgeSchema.safeParse({
        id: 'edge-001',
        type: 'causal',
        target: 'event:e2',
        meta: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('lineageGraphSummarySchema', () => {
    it('validates a valid summary', () => {
      const result = lineageGraphSummarySchema.safeParse({
        nodeCount: 10,
        edgeCount: 15,
        nodeTypeCounts: { run: 1, event: 7, side_effect: 1, external_system: 1 },
        edgeTypeCounts: { causal: 3, temporal: 7, produces: 2, delegation: 0, data_flow: 3 },
        maxCausalDepth: 3,
        runCount: 1,
        externalSystemCount: 1,
        sideEffectCount: 1,
        hasDelegation: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('integrityIssueSchema', () => {
    it('validates a valid integrity issue', () => {
      const result = integrityIssueSchema.safeParse({
        type: 'dangling_edge_source',
        message: 'Source node not found',
        relatedNodeIds: ['event:e1'],
        relatedEdgeIds: ['edge-001'],
      });
      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Serialized graph validation
  // -----------------------------------------------------------------------

  describe('serializedLineageGraphSchema', () => {
    it('validates a serialized graph built from events', () => {
      seq = 0;
      resetEdgeCounter();

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 've1' as EventId,
          type: 'run.start',
          sequence: 1,
          payload: { runName: 'validator-test' },
        }),
        makeEvent({
          id: 've2' as EventId,
          type: 'run.end',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);
      const serialized = serializeGraph(graph);
      const result = serializedLineageGraphSchema.safeParse(serialized);

      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Helper functions
  // -----------------------------------------------------------------------

  describe('validateSerializedGraph', () => {
    it('returns success for valid serialized graph', () => {
      seq = 0;
      resetEdgeCounter();

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'vsg1' as EventId,
          type: 'run.start',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'vsg2' as EventId,
          type: 'run.end',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);
      const serialized = serializeGraph(graph);
      const result = validateSerializedGraph(serialized);
      expect(result.success).toBe(true);
    });

    it('returns failure for invalid input', () => {
      const result = validateSerializedGraph({ nodes: 'not-an-array' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('validateNode', () => {
    it('returns success for a valid node', () => {
      const result = validateNode({
        id: 'event:e1' as NodeId,
        type: 'event',
        tenantId: 'tenant-001',
        runId: 'run-001',
        meta: {
          eventType: 'run.start',
          sourceAgent: 'test-agent',
          timestamp: '2026-01-01T00:00:00Z',
          sequence: 1,
        },
        sourceEventId: 'e1',
      });
      expect(result.success).toBe(true);
    });

    it('returns failure for invalid node', () => {
      const result = validateNode({ type: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('validateEdge', () => {
    it('returns success for a valid edge', () => {
      const result = validateEdge({
        id: 'edge-001' as EdgeId,
        type: 'causal',
        source: 'event:e1' as NodeId,
        target: 'event:e2' as NodeId,
        meta: { parentEventId: 'e1' },
      });
      expect(result.success).toBe(true);
    });

    it('returns failure for invalid edge', () => {
      const result = validateEdge({ id: 123 });
      expect(result.success).toBe(false);
    });
  });
});
