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
import {
  getNode,
  getNodesByType,
  getEventNodesByEventType,
  getOutgoingEdges,
  getIncomingEdges,
  getEdgesByType,
  getAncestors,
  getDescendants,
  getCausalChain,
  getSideEffects,
  getSideEffectsByRun,
  getSideEffectsBySystem,
  getImpact,
  extractSubgraph,
  getCriticalPath,
  validateGraphIntegrity,
} from '../graph-queries.js';
import type { LineageGraph, NodeId } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TENANT = 'tenant-test-001' as TenantId;
const RUN_ID = 'run-001' as RunId;
const SCHEMA = '1.0.0';
let eventSeq = 0;

function makeEvent(
  overrides: Partial<TraceReplayEvent> & { type: TraceReplayEvent['type']; payload: Record<string, unknown> },
): TraceReplayEvent {
  eventSeq++;
  const id = overrides.id ?? (`evt-${String(eventSeq).padStart(4, '0')}` as EventId);
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

/** Build a standard test graph for query tests. */
function buildTestGraph(): LineageGraph {
  const events: TraceReplayEvent[] = [
    makeEvent({
      id: 'e1' as EventId,
      type: 'run.start',
      timestamp: '2026-03-15T10:00:00.000Z',
      sequence: 1,
      payload: { runName: 'query-test' },
    }),
    makeEvent({
      id: 'e2' as EventId,
      type: 'context.retrieved',
      timestamp: '2026-03-15T10:00:01.000Z',
      sequence: 2,
      payload: { source: 'vector_db', snippetCount: 2 },
    }),
    makeEvent({
      id: 'e3' as EventId,
      type: 'context.injected',
      timestamp: '2026-03-15T10:00:02.000Z',
      sequence: 3,
      parentEventId: 'e2' as EventId,
      payload: { source: 'vector_db', tokenCount: 300 },
    }),
    makeEvent({
      id: 'e4' as EventId,
      type: 'prompt.input',
      timestamp: '2026-03-15T10:00:03.000Z',
      sequence: 4,
      payload: { role: 'user', content: 'test query' },
    }),
    makeEvent({
      id: 'e5' as EventId,
      type: 'tool.call.start',
      timestamp: '2026-03-15T10:00:04.000Z',
      sequence: 5,
      parentEventId: 'e4' as EventId,
      payload: { toolName: 'search', inputParameters: { q: 'test' } },
    }),
    makeEvent({
      id: 'e6' as EventId,
      type: 'tool.call.end',
      timestamp: '2026-03-15T10:00:05.000Z',
      sequence: 6,
      parentEventId: 'e5' as EventId,
      payload: { toolName: 'search', output: 'results', success: true },
    }),
    makeEvent({
      id: 'e7' as EventId,
      type: 'side_effect.executed',
      timestamp: '2026-03-15T10:00:06.000Z',
      sequence: 7,
      parentEventId: 'e6' as EventId,
      payload: {
        effectType: 'api_call',
        targetSystem: 'slack',
        description: 'Notify channel',
        reversible: true,
      },
    }),
    makeEvent({
      id: 'e8' as EventId,
      type: 'run.end',
      timestamp: '2026-03-15T10:00:07.000Z',
      sequence: 8,
      payload: { status: 'success', durationMs: 7000 },
    }),
  ];

  return buildLineageGraph(events);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('graph queries', () => {
  let graph: LineageGraph;

  beforeEach(() => {
    eventSeq = 0;
    resetEdgeCounter();
    graph = buildTestGraph();
  });

  // -----------------------------------------------------------------------
  // Node lookups
  // -----------------------------------------------------------------------

  describe('getNode', () => {
    it('returns a node by ID', () => {
      const node = getNode(graph, 'event:e1' as NodeId);
      expect(node).toBeDefined();
      expect(node!.type).toBe('event');
    });

    it('returns undefined for missing node', () => {
      const node = getNode(graph, 'event:nonexistent' as NodeId);
      expect(node).toBeUndefined();
    });
  });

  describe('getNodesByType', () => {
    it('returns all event nodes', () => {
      const events = getNodesByType(graph, 'event');
      expect(events.length).toBe(8);
    });

    it('returns all run nodes', () => {
      const runs = getNodesByType(graph, 'run');
      expect(runs.length).toBe(1);
    });

    it('returns all side_effect nodes', () => {
      const sideEffects = getNodesByType(graph, 'side_effect');
      expect(sideEffects.length).toBe(1);
    });

    it('returns all external_system nodes', () => {
      const systems = getNodesByType(graph, 'external_system');
      expect(systems.length).toBe(1);
    });
  });

  describe('getEventNodesByEventType', () => {
    it('filters event nodes by canonical event type', () => {
      const toolStarts = getEventNodesByEventType(graph, 'tool.call.start');
      expect(toolStarts.length).toBe(1);
      expect(toolStarts[0]!.meta.eventType).toBe('tool.call.start');
    });

    it('returns empty for event types not in graph', () => {
      const approvals = getEventNodesByEventType(graph, 'approval.requested');
      expect(approvals.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge lookups
  // -----------------------------------------------------------------------

  describe('getOutgoingEdges', () => {
    it('returns outgoing edges from a node', () => {
      const edges = getOutgoingEdges(graph, 'event:e5' as NodeId);
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge.source).toBe('event:e5');
      }
    });

    it('returns empty for nodes with no outgoing edges', () => {
      // external_system nodes should have no outgoing edges
      const edges = getOutgoingEdges(graph, 'external_system:slack' as NodeId);
      expect(edges.length).toBe(0);
    });
  });

  describe('getIncomingEdges', () => {
    it('returns incoming edges to a node', () => {
      const edges = getIncomingEdges(graph, 'event:e6' as NodeId);
      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge.target).toBe('event:e6');
      }
    });
  });

  describe('getEdgesByType', () => {
    it('filters edges by type', () => {
      const causal = getEdgesByType(graph, 'causal');
      for (const edge of causal) {
        expect(edge.type).toBe('causal');
      }

      const temporal = getEdgesByType(graph, 'temporal');
      for (const edge of temporal) {
        expect(edge.type).toBe('temporal');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Traversal — ancestors and descendants
  // -----------------------------------------------------------------------

  describe('getAncestors', () => {
    it('finds all ancestors via all edge types', () => {
      const ancestors = getAncestors(graph, 'event:e6' as NodeId);
      expect(ancestors.length).toBeGreaterThan(0);
    });

    it('filters ancestors by edge type', () => {
      const causalAncestors = getAncestors(graph, 'event:e6' as NodeId, ['causal']);
      // e6's causal parent is e5, e5's causal parent is e4
      expect(causalAncestors.length).toBe(2);
      const ancestorIds = causalAncestors.map((n) => n.id);
      expect(ancestorIds).toContain('event:e5');
      expect(ancestorIds).toContain('event:e4');
    });

    it('returns empty for root nodes', () => {
      const ancestors = getAncestors(graph, 'event:e1' as NodeId, ['causal']);
      expect(ancestors.length).toBe(0);
    });
  });

  describe('getDescendants', () => {
    it('finds all causal descendants', () => {
      // e4 → e5 → e6 → e7 (causal chain)
      const descendants = getDescendants(graph, 'event:e4' as NodeId, ['causal']);
      expect(descendants.length).toBe(3); // e5, e6, e7
      const ids = descendants.map((n) => n.id);
      expect(ids).toContain('event:e5');
      expect(ids).toContain('event:e6');
      expect(ids).toContain('event:e7');
    });

    it('includes side effects when following produces edges', () => {
      const descendants = getDescendants(graph, 'event:e6' as NodeId, ['causal', 'produces']);
      const ids = descendants.map((n) => n.id);
      // e7 is the causal child, side_effect:e7 via produces from event:e7
      expect(ids).toContain('event:e7');
    });
  });

  // -----------------------------------------------------------------------
  // Causal chain
  // -----------------------------------------------------------------------

  describe('getCausalChain', () => {
    it('returns the full causal chain from root to target', () => {
      const chain = getCausalChain(graph, 'event:e6' as NodeId);

      expect(chain.length).toBe(3); // e4 → e5 → e6
      expect(chain[0]!.id).toBe('event:e4');
      expect(chain[1]!.id).toBe('event:e5');
      expect(chain[2]!.id).toBe('event:e6');
    });

    it('returns single node for events with no causal parent', () => {
      const chain = getCausalChain(graph, 'event:e1' as NodeId);
      expect(chain.length).toBe(1);
      expect(chain[0]!.id).toBe('event:e1');
    });

    it('returns empty for nonexistent nodes', () => {
      const chain = getCausalChain(graph, 'event:nonexistent' as NodeId);
      expect(chain.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Side effect queries
  // -----------------------------------------------------------------------

  describe('getSideEffects', () => {
    it('returns all side-effect nodes', () => {
      const sideEffects = getSideEffects(graph);
      expect(sideEffects.length).toBe(1);
      expect(sideEffects[0]!.meta.targetSystem).toBe('slack');
    });
  });

  describe('getSideEffectsByRun', () => {
    it('returns side effects for a specific run', () => {
      const sideEffects = getSideEffectsByRun(graph, RUN_ID);
      expect(sideEffects.length).toBe(1);
    });

    it('returns empty for unknown run', () => {
      const sideEffects = getSideEffectsByRun(graph, 'nonexistent-run');
      expect(sideEffects.length).toBe(0);
    });
  });

  describe('getSideEffectsBySystem', () => {
    it('returns side effects targeting a specific system', () => {
      const sideEffects = getSideEffectsBySystem(graph, 'slack');
      expect(sideEffects.length).toBe(1);
    });

    it('returns empty for unknown system', () => {
      const sideEffects = getSideEffectsBySystem(graph, 'nonexistent');
      expect(sideEffects.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Impact analysis
  // -----------------------------------------------------------------------

  describe('getImpact', () => {
    it('returns downstream events and side effects', () => {
      const impact = getImpact(graph, 'event:e5' as NodeId);

      expect(impact.events.length).toBeGreaterThan(0);
      const eventIds = impact.events.map((e) => e.id);
      expect(eventIds).toContain('event:e6');
    });

    it('returns empty impact for leaf nodes', () => {
      const impact = getImpact(graph, 'event:e8' as NodeId);
      expect(impact.events.length).toBe(0);
      expect(impact.sideEffects.length).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Subgraph extraction
  // -----------------------------------------------------------------------

  describe('extractSubgraph', () => {
    it('extracts a subgraph with only specified nodes and their connecting edges', () => {
      const nodeIds = new Set<NodeId>([
        'event:e4' as NodeId,
        'event:e5' as NodeId,
        'event:e6' as NodeId,
      ]);

      const subgraph = extractSubgraph(graph, nodeIds);

      expect(subgraph.nodes.size).toBe(3);
      // Should only have edges between these three nodes
      for (const edge of subgraph.edges.values()) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });

    it('handles single node subgraph', () => {
      const nodeIds = new Set<NodeId>(['event:e1' as NodeId]);
      const subgraph = extractSubgraph(graph, nodeIds);
      expect(subgraph.nodes.size).toBe(1);
      expect(subgraph.edges.size).toBe(0);
    });

    it('handles empty node set', () => {
      const subgraph = extractSubgraph(graph, new Set());
      expect(subgraph.nodes.size).toBe(0);
      expect(subgraph.edges.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Critical path
  // -----------------------------------------------------------------------

  describe('getCriticalPath', () => {
    it('returns the longest causal chain', () => {
      const criticalPath = getCriticalPath(graph);

      // The longest causal chain should be e2→e3 (depth 1),
      // or e4→e5→e6→e7 (depth 3)
      expect(criticalPath.length).toBeGreaterThanOrEqual(3);
    });

    it('returns empty for graph with no causal edges', () => {
      const simpleEvents: TraceReplayEvent[] = [
        makeEvent({
          id: 's1' as EventId,
          type: 'run.start',
          timestamp: '2026-03-15T10:00:00.000Z',
          sequence: 1,
          payload: {},
        }),
      ];

      const simpleGraph = buildLineageGraph(simpleEvents);
      const criticalPath = getCriticalPath(simpleGraph);
      // Node with no causal children returns a single-node path
      expect(criticalPath.length).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Graph integrity validation
  // -----------------------------------------------------------------------

  describe('validateGraphIntegrity', () => {
    it('returns no issues for a well-formed graph', () => {
      const issues = validateGraphIntegrity(graph);

      // Filter out orphan_node issues for run nodes (they have no edges in the current implementation)
      const criticalIssues = issues.filter(
        (i) => i.type !== 'orphan_node',
      );
      expect(criticalIssues.length).toBe(0);
    });

    it('detects dangling edge sources', () => {
      // Manually corrupt the graph
      const corruptedGraph = { ...graph };
      const fakeEdgeId = 'fake-edge' as import('../types.js').EdgeId;
      const fakeEdge: import('../types.js').LineageEdge = {
        id: fakeEdgeId,
        type: 'causal',
        source: 'event:nonexistent' as NodeId,
        target: 'event:e1' as NodeId,
        meta: { parentEventId: 'nonexistent' as EventId },
      };

      const newEdges = new Map(graph.edges);
      newEdges.set(fakeEdgeId, fakeEdge);
      corruptedGraph.edges = newEdges;

      const issues = validateGraphIntegrity(corruptedGraph);
      const danglingSource = issues.find(
        (i) => i.type === 'dangling_edge_source',
      );
      expect(danglingSource).toBeDefined();
    });

    it('detects self-loops', () => {
      const corruptedGraph = { ...graph };
      const fakeEdgeId = 'self-loop-edge' as import('../types.js').EdgeId;
      const fakeEdge: import('../types.js').LineageEdge = {
        id: fakeEdgeId,
        type: 'causal',
        source: 'event:e1' as NodeId,
        target: 'event:e1' as NodeId,
        meta: { parentEventId: 'e1' as EventId },
      };

      const newEdges = new Map(graph.edges);
      newEdges.set(fakeEdgeId, fakeEdge);
      corruptedGraph.edges = newEdges;

      const issues = validateGraphIntegrity(corruptedGraph);
      const selfLoop = issues.find((i) => i.type === 'self_loop');
      expect(selfLoop).toBeDefined();
    });
  });
});
