import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLineageGraph, DEFAULT_EDGE_VISIBILITY } from '@/components/lineage/use-lineage-graph';
import type { RunEvent } from '@/lib/api';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<RunEvent> & { id: string; type: string }): RunEvent {
  return {
    runId: 'run-001',
    tenantId: 'tenant-001',
    sequence: null,
    parentEventId: null,
    sourceAgent: 'test-agent',
    sourceFramework: null,
    payload: {},
    rawMeta: null,
    tags: {},
    schemaVersion: '1.0.0',
    timestamp: '2026-03-22T10:00:00.000Z',
    receivedAt: '2026-03-22T10:00:01.000Z',
    ...overrides,
  };
}

function makeSimpleRunEvents(): RunEvent[] {
  return [
    makeEvent({
      id: 'evt-1',
      type: 'run.start',
      timestamp: '2026-03-22T10:00:00.000Z',
      sequence: 1,
      payload: { runName: 'Test Run', triggerSource: 'api' },
    }),
    makeEvent({
      id: 'evt-2',
      type: 'prompt.input',
      timestamp: '2026-03-22T10:00:01.000Z',
      sequence: 2,
      payload: { role: 'user', content: 'Hello', tokenCount: 5 },
    }),
    makeEvent({
      id: 'evt-3',
      type: 'tool.call.start',
      timestamp: '2026-03-22T10:00:02.000Z',
      sequence: 3,
      parentEventId: 'evt-2',
      payload: { toolName: 'search', inputParameters: {} },
    }),
    makeEvent({
      id: 'evt-4',
      type: 'tool.call.end',
      timestamp: '2026-03-22T10:00:03.000Z',
      sequence: 4,
      parentEventId: 'evt-3',
      payload: { toolName: 'search', output: {}, durationMs: 500, success: true },
    }),
    makeEvent({
      id: 'evt-5',
      type: 'prompt.output',
      timestamp: '2026-03-22T10:00:04.000Z',
      sequence: 5,
      payload: { content: 'Result', tokenCount: 10 },
    }),
    makeEvent({
      id: 'evt-6',
      type: 'run.end',
      timestamp: '2026-03-22T10:00:05.000Z',
      sequence: 6,
      payload: { status: 'success', durationMs: 5000 },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLineageGraph', () => {
  it('returns isEmpty=true for empty events', () => {
    const { result } = renderHook(() => useLineageGraph([]));

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.nodes).toHaveLength(0);
    expect(result.current.edges).toHaveLength(0);
    expect(result.current.graph).toBeNull();
  });

  it('creates nodes for a simple run', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    expect(result.current.isEmpty).toBe(false);
    expect(result.current.graph).not.toBeNull();

    // 1 run node + 6 event nodes = 7 minimum nodes
    expect(result.current.nodes.length).toBeGreaterThanOrEqual(7);
  });

  it('creates React Flow nodes with correct type', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    for (const node of result.current.nodes) {
      expect(node.type).toBe('lineageNode');
    }
  });

  it('assigns position coordinates to all nodes', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    for (const node of result.current.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
    }
  });

  it('creates edges with correct type', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    for (const edge of result.current.edges) {
      expect(edge.type).toBe('lineageEdge');
    }
  });

  it('creates causal edges from parentEventId', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    const causalEdges = result.current.edges.filter(
      (e) => e.data?.edgeType === 'causal',
    );
    // evt-2 -> evt-3 (tool call parent) and evt-3 -> evt-4 (tool end parent)
    expect(causalEdges.length).toBeGreaterThanOrEqual(2);
  });

  it('filters out temporal edges by default', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    const temporalEdges = result.current.edges.filter(
      (e) => e.data?.edgeType === 'temporal',
    );
    expect(temporalEdges).toHaveLength(0);
  });

  it('shows temporal edges when visibility is enabled', () => {
    const events = makeSimpleRunEvents();
    const visibility = { ...DEFAULT_EDGE_VISIBILITY, temporal: true };
    const { result } = renderHook(() => useLineageGraph(events, visibility));

    const temporalEdges = result.current.edges.filter(
      (e) => e.data?.edgeType === 'temporal',
    );
    // Should have temporal edges between sequential events
    expect(temporalEdges.length).toBeGreaterThan(0);
  });

  it('hides causal edges when visibility is disabled', () => {
    const events = makeSimpleRunEvents();
    const visibility = { ...DEFAULT_EDGE_VISIBILITY, causal: false };
    const { result } = renderHook(() => useLineageGraph(events, visibility));

    const causalEdges = result.current.edges.filter(
      (e) => e.data?.edgeType === 'causal',
    );
    expect(causalEdges).toHaveLength(0);
  });

  it('includes node data with label and nodeType', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    for (const node of result.current.nodes) {
      expect(node.data).toBeDefined();
      expect(node.data.nodeType).toBeTruthy();
      expect(node.data.label).toBeTruthy();
    }
  });

  it('includes edge data with edgeType', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    for (const edge of result.current.edges) {
      expect(edge.data).toBeDefined();
      expect(edge.data!.edgeType).toBeTruthy();
    }
  });

  it('includes event nodes with eventType set', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    const eventNodes = result.current.nodes.filter(
      (n) => n.data.nodeType === 'event',
    );
    for (const node of eventNodes) {
      expect(node.data.eventType).toBeTruthy();
    }
  });

  it('creates run node with correct label', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    const runNodes = result.current.nodes.filter(
      (n) => n.data.nodeType === 'run',
    );
    expect(runNodes).toHaveLength(1);
    expect(runNodes[0]!.data.label).toContain('Test Run');
  });

  it('provides graph summary', () => {
    const events = makeSimpleRunEvents();
    const { result } = renderHook(() => useLineageGraph(events));

    const graph = result.current.graph!;
    expect(graph.summary.nodeCount).toBeGreaterThanOrEqual(7);
    expect(graph.summary.runCount).toBe(1);
    expect(graph.summary.nodeTypeCounts.event).toBe(6);
  });

  it('handles events with side effects', () => {
    const events = [
      ...makeSimpleRunEvents().slice(0, -1),
      makeEvent({
        id: 'evt-se-1',
        type: 'side_effect.executed',
        timestamp: '2026-03-22T10:00:04.500Z',
        sequence: 7,
        payload: {
          effectType: 'api_call',
          targetSystem: 'slack',
          description: 'Sent notification',
          reversible: false,
        },
      }),
      makeSimpleRunEvents().at(-1)!,
    ];

    const { result } = renderHook(() => useLineageGraph(events));

    const sideEffectNodes = result.current.nodes.filter(
      (n) => n.data.nodeType === 'side_effect',
    );
    expect(sideEffectNodes.length).toBeGreaterThanOrEqual(1);

    const externalNodes = result.current.nodes.filter(
      (n) => n.data.nodeType === 'external_system',
    );
    expect(externalNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('is memoized — same events return same nodes/edges', () => {
    const events = makeSimpleRunEvents();
    const { result, rerender } = renderHook(() => useLineageGraph(events));

    const firstNodes = result.current.nodes;
    const firstEdges = result.current.edges;

    rerender();

    expect(result.current.nodes).toBe(firstNodes);
    expect(result.current.edges).toBe(firstEdges);
  });
});
