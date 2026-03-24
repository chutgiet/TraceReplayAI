import { describe, it, expect, beforeEach } from 'vitest';
import type {
  TraceReplayEvent,
  EventId,
  RunId,
  TenantId,
} from '@tracereplay/event-schema';
import {
  buildLineageGraph,
  resetEdgeCounter,
} from '../graph-builder.js';
import type {
  LineageGraph,
  NodeId,
  EventNode,
  SideEffectNode,
  RunNode,
} from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TENANT = 'tenant-test-001' as TenantId;
const RUN_ID = 'run-001' as RunId;
const SCHEMA = '1.0.0';

let eventSeq = 0;

function makeEventId(suffix?: string): EventId {
  eventSeq++;
  return (suffix ?? `evt-${String(eventSeq).padStart(4, '0')}`) as EventId;
}

function makeEvent(
  overrides: Partial<TraceReplayEvent> & { type: TraceReplayEvent['type']; payload: Record<string, unknown> },
): TraceReplayEvent {
  const id = overrides.id ?? makeEventId();
  return {
    id,
    runId: overrides.runId ?? RUN_ID,
    type: overrides.type,
    timestamp: overrides.timestamp ?? new Date(Date.now() + eventSeq * 1000).toISOString(),
    tenantId: overrides.tenantId ?? TENANT,
    sourceAgent: overrides.sourceAgent ?? 'test-agent',
    schemaVersion: overrides.schemaVersion ?? SCHEMA,
    payload: overrides.payload,
    sequence: overrides.sequence ?? eventSeq,
    parentEventId: overrides.parentEventId,
    sourceFramework: overrides.sourceFramework,
    tags: overrides.tags,
    rawMeta: overrides.rawMeta,
  } as TraceReplayEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildLineageGraph', () => {
  beforeEach(() => {
    eventSeq = 0;
    resetEdgeCounter();
  });

  // -----------------------------------------------------------------------
  // Empty input
  // -----------------------------------------------------------------------

  it('returns an empty graph for empty events array', () => {
    const graph = buildLineageGraph([]);

    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.size).toBe(0);
    expect(graph.summary.nodeCount).toBe(0);
    expect(graph.summary.edgeCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Simple run (run.start + run.end)
  // -----------------------------------------------------------------------

  describe('simple run lifecycle', () => {
    let graph: LineageGraph;
    let startId: EventId;
    let endId: EventId;

    beforeEach(() => {
      startId = 'start-001' as EventId;
      endId = 'end-001' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: startId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'test-run', triggerSource: 'api' },
        }),
        makeEvent({
          id: endId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:05.000Z',
          sequence: 2,
          payload: { status: 'success', durationMs: 5000 },
        }),
      ];

      graph = buildLineageGraph(events);
    });

    it('creates a run node', () => {
      const runNodeId = `run:${RUN_ID}` as NodeId;
      const runNode = graph.nodes.get(runNodeId);
      expect(runNode).toBeDefined();
      expect(runNode?.type).toBe('run');
      expect((runNode as RunNode).meta.runName).toBe('test-run');
      expect((runNode as RunNode).meta.status).toBe('success');
      expect((runNode as RunNode).meta.durationMs).toBe(5000);
    });

    it('creates event nodes for start and end', () => {
      const startNodeId = `event:${startId}` as NodeId;
      const endNodeId = `event:${endId}` as NodeId;

      expect(graph.nodes.has(startNodeId)).toBe(true);
      expect(graph.nodes.has(endNodeId)).toBe(true);

      const startNode = graph.nodes.get(startNodeId) as EventNode;
      expect(startNode.meta.eventType).toBe('run.start');
      expect(startNode.meta.label).toBe('test-run');
    });

    it('creates temporal edge between events', () => {
      let foundTemporal = false;
      for (const edge of graph.edges.values()) {
        if (edge.type === 'temporal') {
          foundTemporal = true;
          expect(edge.source).toBe(`event:${startId}`);
          expect(edge.target).toBe(`event:${endId}`);
        }
      }
      expect(foundTemporal).toBe(true);
    });

    it('computes correct summary', () => {
      expect(graph.summary.nodeCount).toBe(3); // 1 run + 2 events
      expect(graph.summary.nodeTypeCounts.run).toBe(1);
      expect(graph.summary.nodeTypeCounts.event).toBe(2);
      expect(graph.summary.runCount).toBe(1);
      expect(graph.summary.hasDelegation).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Parent-child causal linking
  // -----------------------------------------------------------------------

  describe('causal linking', () => {
    it('creates causal edges from parentEventId', () => {
      const parentId = 'tool-start-001' as EventId;
      const childId = 'tool-end-001' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start-001' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'causal-test' },
        }),
        makeEvent({
          id: parentId,
          type: 'tool.call.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { toolName: 'search', inputParameters: { query: 'test' } },
        }),
        makeEvent({
          id: childId,
          type: 'tool.call.end',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          parentEventId: parentId,
          payload: { toolName: 'search', output: 'result', success: true },
        }),
      ];

      const graph = buildLineageGraph(events);

      const causalEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'causal',
      );
      expect(causalEdges.length).toBe(1);
      expect(causalEdges[0]!.source).toBe(`event:${parentId}`);
      expect(causalEdges[0]!.target).toBe(`event:${childId}`);
    });

    it('computes max causal depth correctly', () => {
      const e1 = 'e1' as EventId;
      const e2 = 'e2' as EventId;
      const e3 = 'e3' as EventId;
      const e4 = 'e4' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: e1,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: e2,
          type: 'prompt.input',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          parentEventId: e1,
          payload: { role: 'user', content: 'test' },
        }),
        makeEvent({
          id: e3,
          type: 'tool.call.start',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          parentEventId: e2,
          payload: { toolName: 'test', inputParameters: {} },
        }),
        makeEvent({
          id: e4,
          type: 'tool.call.end',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 4,
          parentEventId: e3,
          payload: { toolName: 'test', output: 'done', success: true },
        }),
      ];

      const graph = buildLineageGraph(events);
      expect(graph.summary.maxCausalDepth).toBe(3); // e1→e2→e3→e4 = depth 3
    });
  });

  // -----------------------------------------------------------------------
  // Side effects
  // -----------------------------------------------------------------------

  describe('side effects', () => {
    it('creates side-effect nodes and produces edges for executed effects', () => {
      const seId = 'se-001' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start-001' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: seId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: {
            effectType: 'api_call',
            targetSystem: 'slack',
            description: 'Sent notification',
            reversible: true,
          },
        }),
      ];

      const graph = buildLineageGraph(events);

      // Side-effect node
      const seNodeId = `side_effect:${seId}` as NodeId;
      const seNode = graph.nodes.get(seNodeId) as SideEffectNode;
      expect(seNode).toBeDefined();
      expect(seNode.type).toBe('side_effect');
      expect(seNode.meta.effectType).toBe('api_call');
      expect(seNode.meta.targetSystem).toBe('slack');
      expect(seNode.meta.success).toBe(true);

      // External system node
      const sysNodeId = 'external_system:slack' as NodeId;
      expect(graph.nodes.has(sysNodeId)).toBe(true);
      expect(graph.summary.externalSystemCount).toBe(1);
      expect(graph.summary.sideEffectCount).toBe(1);
    });

    it('creates side-effect nodes for failed effects', () => {
      const seId = 'se-fail-001' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start-001' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: seId,
          type: 'side_effect.failed',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: {
            effectType: 'db_write',
            targetSystem: 'postgres',
            description: 'Insert user record',
            errorType: 'ConnectionError',
            errorMessage: 'timeout',
          },
        }),
      ];

      const graph = buildLineageGraph(events);

      const seNodeId = `side_effect:${seId}` as NodeId;
      const seNode = graph.nodes.get(seNodeId) as SideEffectNode;
      expect(seNode).toBeDefined();
      expect(seNode.meta.success).toBe(false);
      expect(seNode.meta.errorMessage).toBe('timeout');
    });

    it('creates produces edges from event to side_effect and side_effect to external_system', () => {
      const seId = 'se-002' as EventId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start-001' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: seId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: {
            effectType: 'email',
            targetSystem: 'sendgrid',
            description: 'Sent email',
            reversible: false,
          },
        }),
      ];

      const graph = buildLineageGraph(events);

      const producesEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'produces',
      );

      // event → side_effect + side_effect → external_system
      expect(producesEdges.length).toBe(2);

      const eventToSe = producesEdges.find(
        (e) => e.source === `event:${seId}`,
      );
      expect(eventToSe).toBeDefined();
      expect(eventToSe!.target).toBe(`side_effect:${seId}`);

      const seToSys = producesEdges.find(
        (e) => e.source === `side_effect:${seId}`,
      );
      expect(seToSys).toBeDefined();
      expect(seToSys!.target).toBe('external_system:sendgrid');
    });
  });

  // -----------------------------------------------------------------------
  // Temporal edges
  // -----------------------------------------------------------------------

  describe('temporal edges', () => {
    it('creates temporal edges between adjacent events', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'prompt.input',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { role: 'user', content: 'test' },
        }),
        makeEvent({
          id: 'e3' as EventId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 3,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);

      const temporalEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'temporal',
      );
      expect(temporalEdges.length).toBe(2); // e1→e2, e2→e3

      const e1to2 = temporalEdges.find(
        (e) => e.source === 'event:e1' && e.target === 'event:e2',
      );
      expect(e1to2).toBeDefined();
      expect(e1to2!.meta).toEqual({ gapMs: 1000 });

      const e2to3 = temporalEdges.find(
        (e) => e.source === 'event:e2' && e.target === 'event:e3',
      );
      expect(e2to3).toBeDefined();
      expect(e2to3!.meta).toEqual({ gapMs: 2000 });
    });

    it('skips temporal edges when includeTemporal is false', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events, { includeTemporal: false });

      const temporalEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'temporal',
      );
      expect(temporalEdges.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Data flow edges
  // -----------------------------------------------------------------------

  describe('data flow edges', () => {
    it('detects data flow from context.retrieved to context.injected', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'context.retrieved',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { source: 'vector_db', snippetCount: 3 },
        }),
        makeEvent({
          id: 'e3' as EventId,
          type: 'context.injected',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          payload: { source: 'vector_db', tokenCount: 500 },
        }),
      ];

      const graph = buildLineageGraph(events);

      const dataFlowEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'data_flow',
      );
      expect(dataFlowEdges.length).toBeGreaterThanOrEqual(1);

      const retrieveToInject = dataFlowEdges.find(
        (e) => e.source === 'event:e2' && e.target === 'event:e3',
      );
      expect(retrieveToInject).toBeDefined();
      expect(retrieveToInject!.meta).toEqual({
        description: 'Retrieved context injected into prompt',
      });
    });

    it('skips data flow edges when includeDataFlow is false', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'context.retrieved',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { source: 'vector_db' },
        }),
        makeEvent({
          id: 'e3' as EventId,
          type: 'context.injected',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          payload: { source: 'vector_db' },
        }),
      ];

      const graph = buildLineageGraph(events, { includeDataFlow: false });

      const dataFlowEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'data_flow',
      );
      expect(dataFlowEdges.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-agent delegation
  // -----------------------------------------------------------------------

  describe('sub-agent delegation', () => {
    it('creates delegation edges when runs have parentRunId', () => {
      const parentRunId = 'run-parent' as RunId;
      const childRunId = 'run-child' as RunId;

      const events: TraceReplayEvent[] = [
        // Parent run
        makeEvent({
          id: 'p-start' as EventId,
          runId: parentRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'parent-run' },
        }),
        // Child run with parentRunId reference
        makeEvent({
          id: 'c-start' as EventId,
          runId: childRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 1,
          payload: { runName: 'child-run', parentRunId },
        }),
        makeEvent({
          id: 'c-end' as EventId,
          runId: childRunId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
        makeEvent({
          id: 'p-end' as EventId,
          runId: parentRunId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);

      const delegationEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'delegation',
      );
      expect(delegationEdges.length).toBe(1);
      expect(delegationEdges[0]!.source).toBe(`run:${parentRunId}`);
      expect(delegationEdges[0]!.target).toBe(`run:${childRunId}`);
      expect(graph.summary.hasDelegation).toBe(true);
      expect(graph.summary.runCount).toBe(2);
    });

    it('creates delegation edges via relatedRunEvents option', () => {
      const parentRunId = 'run-parent-rel' as RunId;
      const childRunId = 'run-child-rel' as RunId;

      const primaryEvents: TraceReplayEvent[] = [
        makeEvent({
          id: 'pr-start' as EventId,
          runId: parentRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'parent-run' },
        }),
        makeEvent({
          id: 'pr-end' as EventId,
          runId: parentRunId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:05.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const relatedRunEvents: TraceReplayEvent[] = [
        makeEvent({
          id: 'cr-start' as EventId,
          runId: childRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 1,
          payload: { runName: 'child-run', parentRunId },
        }),
        makeEvent({
          id: 'cr-end' as EventId,
          runId: childRunId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(primaryEvents, { relatedRunEvents });

      expect(graph.summary.runCount).toBe(2);
      expect(graph.summary.hasDelegation).toBe(true);

      const delegationEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'delegation',
      );
      expect(delegationEdges.length).toBe(1);
      expect(delegationEdges[0]!.source).toBe(`run:${parentRunId}`);
      expect(delegationEdges[0]!.target).toBe(`run:${childRunId}`);
    });

    it('creates multiple delegation edges for multiple child runs', () => {
      const parentRunId = 'run-multi-parent' as RunId;
      const childRunId1 = 'run-multi-child-1' as RunId;
      const childRunId2 = 'run-multi-child-2' as RunId;

      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'mp-start' as EventId,
          runId: parentRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'multi-parent' },
        }),
        makeEvent({
          id: 'mc1-start' as EventId,
          runId: childRunId1,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 1,
          payload: { runName: 'child-1', parentRunId },
        }),
        makeEvent({
          id: 'mc2-start' as EventId,
          runId: childRunId2,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 1,
          payload: { runName: 'child-2', parentRunId },
        }),
        makeEvent({
          id: 'mp-end' as EventId,
          runId: parentRunId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:05.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);

      const delegationEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'delegation',
      );
      expect(delegationEdges.length).toBe(2);
      expect(graph.summary.hasDelegation).toBe(true);
      expect(graph.summary.runCount).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Complex multi-tool scenario
  // -----------------------------------------------------------------------

  describe('complex multi-tool scenario', () => {
    it('handles a run with multiple tool calls, context, and side effects', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'multi-tool-test' },
        }),
        makeEvent({
          id: 'ctx-ret' as EventId,
          type: 'context.retrieved',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { source: 'vector_db', snippetCount: 3 },
        }),
        makeEvent({
          id: 'ctx-inj' as EventId,
          type: 'context.injected',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          parentEventId: 'ctx-ret' as EventId,
          payload: { source: 'vector_db', tokenCount: 500 },
        }),
        makeEvent({
          id: 'prompt-in' as EventId,
          type: 'prompt.input',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 4,
          payload: { role: 'user', content: 'analyze data', tokenCount: 50 },
        }),
        makeEvent({
          id: 'model-req' as EventId,
          type: 'model.request',
          timestamp: '2026-03-15T10:00:04.000Z',
          sequence: 5,
          payload: { modelProvider: 'openai', modelId: 'gpt-4' },
        }),
        makeEvent({
          id: 'model-res' as EventId,
          type: 'model.response',
          timestamp: '2026-03-15T10:00:05.000Z',
          sequence: 6,
          parentEventId: 'model-req' as EventId,
          payload: { modelProvider: 'openai', modelId: 'gpt-4', outputTokens: 200 },
        }),
        makeEvent({
          id: 'tool-start' as EventId,
          type: 'tool.call.start',
          timestamp: '2026-03-15T10:00:06.000Z',
          sequence: 7,
          payload: { toolName: 'calculator', inputParameters: { expr: '2+2' } },
        }),
        makeEvent({
          id: 'tool-end' as EventId,
          type: 'tool.call.end',
          timestamp: '2026-03-15T10:00:07.000Z',
          sequence: 8,
          parentEventId: 'tool-start' as EventId,
          payload: { toolName: 'calculator', output: 4, success: true },
        }),
        makeEvent({
          id: 'se-001' as EventId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:08.000Z',
          sequence: 9,
          payload: {
            effectType: 'api_call',
            targetSystem: 'slack',
            description: 'Posted result',
            reversible: false,
          },
        }),
        makeEvent({
          id: 'end' as EventId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:09.000Z',
          sequence: 10,
          payload: { status: 'success', durationMs: 9000 },
        }),
      ];

      const graph = buildLineageGraph(events);

      // 1 run + 10 events + 1 side_effect + 1 external_system = 13
      expect(graph.summary.nodeTypeCounts.run).toBe(1);
      expect(graph.summary.nodeTypeCounts.event).toBe(10);
      expect(graph.summary.nodeTypeCounts.side_effect).toBe(1);
      expect(graph.summary.nodeTypeCounts.external_system).toBe(1);
      expect(graph.summary.nodeCount).toBe(13);

      // Causal edges: ctx-ret→ctx-inj, model-req→model-res, tool-start→tool-end
      const causalEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'causal',
      );
      expect(causalEdges.length).toBe(3);

      // Temporal edges: 10 events → 9 temporal edges
      const temporalEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'temporal',
      );
      expect(temporalEdges.length).toBe(9);

      // Produces edges: event→side_effect + side_effect→external_system = 2
      const producesEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'produces',
      );
      expect(producesEdges.length).toBe(2);

      // Data flow edges should exist
      const dataFlowEdges = Array.from(graph.edges.values()).filter(
        (e) => e.type === 'data_flow',
      );
      expect(dataFlowEdges.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Event label extraction
  // -----------------------------------------------------------------------

  describe('event label extraction', () => {
    it('generates human-readable labels for each event type', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'lbl-1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'my-run' },
        }),
        makeEvent({
          id: 'lbl-2' as EventId,
          type: 'tool.call.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { toolName: 'web-search', inputParameters: {} },
        }),
        makeEvent({
          id: 'lbl-3' as EventId,
          type: 'run.error',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          payload: { errorType: 'RuntimeError', errorMessage: 'Something broke', fatal: true },
        }),
      ];

      const graph = buildLineageGraph(events);

      const lbl1 = graph.nodes.get('event:lbl-1' as NodeId) as EventNode;
      expect(lbl1.meta.label).toBe('my-run');

      const lbl2 = graph.nodes.get('event:lbl-2' as NodeId) as EventNode;
      expect(lbl2.meta.label).toBe('Tool: web-search');

      const lbl3 = graph.nodes.get('event:lbl-3' as NodeId) as EventNode;
      expect(lbl3.meta.label).toBe('Error: Something broke');
    });
  });

  // -----------------------------------------------------------------------
  // Options: relatedRunEvents
  // -----------------------------------------------------------------------

  describe('relatedRunEvents option', () => {
    it('merges related run events into the graph', () => {
      const mainRunId = 'run-main' as RunId;
      const relatedRunId = 'run-related' as RunId;

      const mainEvents: TraceReplayEvent[] = [
        makeEvent({
          id: 'm-start' as EventId,
          runId: mainRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'main' },
        }),
      ];

      const relatedEvents: TraceReplayEvent[] = [
        makeEvent({
          id: 'r-start' as EventId,
          runId: relatedRunId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 1,
          payload: { runName: 'related', parentRunId: mainRunId },
        }),
      ];

      const graph = buildLineageGraph(mainEvents, {
        relatedRunEvents: relatedEvents,
      });

      expect(graph.summary.runCount).toBe(2);
      expect(graph.summary.hasDelegation).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Run node metadata with missing start/end
  // -----------------------------------------------------------------------

  describe('partial run data', () => {
    it('handles run with no run.start event', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'prompt.input',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 1,
          payload: { role: 'user', content: 'hello' },
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'run.end',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 2,
          payload: { status: 'success' },
        }),
      ];

      const graph = buildLineageGraph(events);

      const runNode = graph.nodes.get(`run:${RUN_ID}` as NodeId) as RunNode;
      expect(runNode).toBeDefined();
      expect(runNode.meta.runName).toBeUndefined();
      expect(runNode.meta.status).toBe('success'); // picked up from run.end
    });

    it('handles run with no run.end event', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'e1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: { runName: 'incomplete-run' },
        }),
        makeEvent({
          id: 'e2' as EventId,
          type: 'prompt.input',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: { role: 'user', content: 'hello' },
        }),
      ];

      const graph = buildLineageGraph(events);

      const runNode = graph.nodes.get(`run:${RUN_ID}` as NodeId) as RunNode;
      expect(runNode.meta.status).toBe('running');
      expect(runNode.meta.durationMs).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Multiple external systems
  // -----------------------------------------------------------------------

  describe('multiple external systems', () => {
    it('creates separate external system nodes for each target', () => {
      const events: TraceReplayEvent[] = [
        makeEvent({
          id: 'start' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
        makeEvent({
          id: 'se-1' as EventId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:01.000Z',
          sequence: 2,
          payload: {
            effectType: 'api_call',
            targetSystem: 'slack',
            description: 'Notify',
            reversible: true,
          },
        }),
        makeEvent({
          id: 'se-2' as EventId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:02.000Z',
          sequence: 3,
          payload: {
            effectType: 'db_write',
            targetSystem: 'postgres',
            description: 'Insert record',
            reversible: false,
          },
        }),
        makeEvent({
          id: 'se-3' as EventId,
          type: 'side_effect.executed',
          timestamp: '2026-03-15T10:00:03.000Z',
          sequence: 4,
          payload: {
            effectType: 'api_call',
            targetSystem: 'slack',
            description: 'Second notification',
            reversible: true,
          },
        }),
      ];

      const graph = buildLineageGraph(events);

      expect(graph.summary.externalSystemCount).toBe(2);
      expect(graph.summary.sideEffectCount).toBe(3);

      const slackNode = graph.nodes.get('external_system:slack' as NodeId);
      expect(slackNode).toBeDefined();
      expect(slackNode!.type).toBe('external_system');

      const pgNode = graph.nodes.get('external_system:postgres' as NodeId);
      expect(pgNode).toBeDefined();
    });
  });
});
