'use client';

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type {
  LineageGraph,
  LineageNode,
  EventNodeMeta,
  RunNodeMeta,
  SideEffectNodeMeta,
  ExternalSystemNodeMeta,
} from '@tracereplay/graph-model';
import { buildLineageGraph } from '@tracereplay/graph-model';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { RunEvent } from '@/lib/api';
import type { LineageNodeData, LineageEdgeData } from './types';
import { getEdgeTypeVisual } from './node-type-config';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;
const HORIZONTAL_SPACING = 280;
const VERTICAL_SPACING = 100;

// ---------------------------------------------------------------------------
// Convert RunEvent → TraceReplayEvent for graph-model
// ---------------------------------------------------------------------------

function toTraceReplayEvent(event: RunEvent): TraceReplayEvent {
  return {
    id: event.id,
    runId: event.runId,
    tenantId: event.tenantId,
    type: event.type,
    timestamp: event.timestamp,
    sequence: event.sequence ?? undefined,
    parentEventId: event.parentEventId ?? undefined,
    sourceAgent: event.sourceAgent,
    sourceFramework: event.sourceFramework ?? undefined,
    payload: event.payload,
    rawMeta: event.rawMeta ?? undefined,
    tags: event.tags ? Object.keys(event.tags) : undefined,
    schemaVersion: event.schemaVersion,
  } as TraceReplayEvent;
}

// ---------------------------------------------------------------------------
// Node label extraction
// ---------------------------------------------------------------------------

function getNodeLabel(node: LineageNode): string {
  switch (node.type) {
    case 'run': {
      const meta = node.meta as RunNodeMeta;
      return meta.runName ?? `Run ${node.runId?.slice(0, 8) ?? ''}…`;
    }
    case 'event': {
      const meta = node.meta as EventNodeMeta;
      return meta.label ?? meta.eventType;
    }
    case 'side_effect': {
      const meta = node.meta as SideEffectNodeMeta;
      return meta.description || `${meta.effectType} → ${meta.targetSystem}`;
    }
    case 'external_system': {
      const meta = node.meta as ExternalSystemNodeMeta;
      return `☁ ${meta.systemName}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Simple layered layout
//
// Uses topological sort of the event nodes within the graph to place them
// in columns (layers) by their depth and rows within each column.
// ---------------------------------------------------------------------------

interface LayoutResult {
  nodes: Node<LineageNodeData>[];
  edges: Edge<LineageEdgeData>[];
}

function layoutGraph(graph: LineageGraph): LayoutResult {
  const flowNodes: Node<LineageNodeData>[] = [];
  const flowEdges: Edge<LineageEdgeData>[] = [];

  // Compute depth (layer) for each node using BFS from roots
  const depthMap = new Map<string, number>();
  const inDegree = new Map<string, number>();

  for (const node of graph.nodes.values()) {
    inDegree.set(node.id, 0);
  }

  // Count in-degrees from causal + temporal + data_flow edges (skip temporal for depth)
  for (const edge of graph.edges.values()) {
    if (edge.type === 'causal' || edge.type === 'data_flow' || edge.type === 'delegation') {
      const cur = inDegree.get(edge.target) ?? 0;
      inDegree.set(edge.target, cur + 1);
    }
  }

  // Roots: nodes with 0 in-degree from causal/data_flow edges
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      depthMap.set(id, 0);
      queue.push(id);
    }
  }

  // BFS to assign max depth
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current) ?? 0;
    const outgoing = graph.adjacency.get(current as never) ?? [];
    for (const edgeId of outgoing) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      if (edge.type === 'temporal') continue; // skip temporal for depth
      const targetId = edge.target;
      const existingDepth = depthMap.get(targetId) ?? -1;
      const newDepth = currentDepth + 1;
      if (newDepth > existingDepth) {
        depthMap.set(targetId, newDepth);
        queue.push(targetId);
      }
    }
  }

  // Assign depth 0 to any remaining unvisited nodes
  for (const node of graph.nodes.values()) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 0);
    }
  }

  // Group nodes by depth column
  const columns = new Map<number, LineageNode[]>();
  for (const node of graph.nodes.values()) {
    const depth = depthMap.get(node.id) ?? 0;
    let col = columns.get(depth);
    if (!col) {
      col = [];
      columns.set(depth, col);
    }
    col.push(node);
  }

  // Sort columns
  const sortedDepths = [...columns.keys()].sort((a, b) => a - b);

  // Position nodes
  for (const depth of sortedDepths) {
    const nodesInCol = columns.get(depth)!;
    // Sort nodes within column: run nodes first, then by timestamp
    nodesInCol.sort((a, b) => {
      if (a.type === 'run' && b.type !== 'run') return -1;
      if (a.type !== 'run' && b.type === 'run') return 1;
      if (a.type === 'external_system' && b.type !== 'external_system') return 1;
      if (a.type !== 'external_system' && b.type === 'external_system') return -1;
      const tsA = a.type === 'event' ? (a.meta as EventNodeMeta).timestamp : '';
      const tsB = b.type === 'event' ? (b.meta as EventNodeMeta).timestamp : '';
      return tsA.localeCompare(tsB);
    });

    for (let row = 0; row < nodesInCol.length; row++) {
      const node = nodesInCol[row]!;
      const eventType = node.type === 'event' ? (node.meta as EventNodeMeta).eventType : undefined;

      flowNodes.push({
        id: node.id,
        type: 'lineageNode',
        position: {
          x: depth * HORIZONTAL_SPACING,
          y: row * VERTICAL_SPACING,
        },
        data: {
          nodeType: node.type,
          label: getNodeLabel(node),
          eventType,
          sourceEventId: node.sourceEventId,
          runId: node.runId,
          meta: node.meta as unknown as Record<string, unknown>,
        },
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      });
    }
  }

  // Create edges
  for (const edge of graph.edges.values()) {
    const visual = getEdgeTypeVisual(edge.type);
    flowEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'lineageEdge',
      data: {
        edgeType: edge.type,
        label: visual.label,
        meta: edge.meta as unknown as Record<string, unknown>,
      },
      style: {
        stroke: visual.color,
        strokeWidth: 2,
        strokeDasharray: visual.strokeDasharray,
      },
      animated: visual.animated ?? false,
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ---------------------------------------------------------------------------
// Edge type visibility filter
// ---------------------------------------------------------------------------

export type EdgeVisibility = Record<string, boolean>;

export const DEFAULT_EDGE_VISIBILITY: EdgeVisibility = {
  causal: true,
  temporal: false, // temporal edges can clutter — hidden by default
  produces: true,
  delegation: true,
  data_flow: true,
};

// ---------------------------------------------------------------------------
// Hook: useLineageGraph
// ---------------------------------------------------------------------------

export interface UseLineageGraphResult {
  nodes: Node<LineageNodeData>[];
  edges: Edge<LineageEdgeData>[];
  graph: LineageGraph | null;
  isEmpty: boolean;
}

const EMPTY_RELATED_EVENTS: RunEvent[] = [];

/**
 * Build lineage graph from run events and convert to React Flow nodes/edges.
 * Accepts the raw RunEvent[] from the API and builds the graph client-side.
 * Optionally accepts related run events (e.g. child sub-agent runs) to render
 * cross-run delegation edges in the lineage graph.
 */
export function useLineageGraph(
  events: RunEvent[],
  edgeVisibility: EdgeVisibility = DEFAULT_EDGE_VISIBILITY,
  relatedRunEvents: RunEvent[] = EMPTY_RELATED_EVENTS,
): UseLineageGraphResult {
  const graph = useMemo(() => {
    if (events.length === 0) return null;
    const traceEvents = events.map(toTraceReplayEvent);
    const relatedTraceEvents = relatedRunEvents.map(toTraceReplayEvent);
    return buildLineageGraph(traceEvents, {
      includeTemporal: true,
      includeDataFlow: true,
      relatedRunEvents: relatedTraceEvents,
    });
  }, [events, relatedRunEvents]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const result = layoutGraph(graph);

    // Filter edges by visibility
    const filtered = result.edges.filter(
      (e) => e.data && edgeVisibility[e.data.edgeType] !== false,
    );

    return { nodes: result.nodes, edges: filtered };
  }, [graph, edgeVisibility]);

  return {
    nodes,
    edges,
    graph,
    isEmpty: !graph || graph.nodes.size === 0,
  };
}
