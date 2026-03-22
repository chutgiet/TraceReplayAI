import type { EventType } from '@tracereplay/event-schema';
import type {
  NodeId,
  EdgeId,
  LineageNode,
  LineageEdge,
  LineageGraph,
  LineageNodeType,
  LineageEdgeType,
  IntegrityIssue,
  SideEffectNode,
  EventNode,
} from './types.js';

// ---------------------------------------------------------------------------
// Node lookups
// ---------------------------------------------------------------------------

/** Get a node by ID, or undefined if not found. */
export function getNode(graph: LineageGraph, nodeId: NodeId): LineageNode | undefined {
  return graph.nodes.get(nodeId);
}

/** Get all nodes of a specific type. */
export function getNodesByType<T extends LineageNodeType>(
  graph: LineageGraph,
  nodeType: T,
): LineageNode<T>[] {
  const result: LineageNode<T>[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === nodeType) {
      result.push(node as LineageNode<T>);
    }
  }
  return result;
}

/** Get all event nodes matching a specific canonical event type. */
export function getEventNodesByEventType(
  graph: LineageGraph,
  eventType: EventType,
): EventNode[] {
  const result: EventNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'event' && (node as EventNode).meta.eventType === eventType) {
      result.push(node as EventNode);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Edge lookups
// ---------------------------------------------------------------------------

/** Get all outgoing edges from a node. */
export function getOutgoingEdges(graph: LineageGraph, nodeId: NodeId): LineageEdge[] {
  const edgeIds = graph.adjacency.get(nodeId) ?? [];
  const result: LineageEdge[] = [];
  for (const eId of edgeIds) {
    const edge = graph.edges.get(eId);
    if (edge) result.push(edge);
  }
  return result;
}

/** Get all incoming edges to a node. */
export function getIncomingEdges(graph: LineageGraph, nodeId: NodeId): LineageEdge[] {
  const edgeIds = graph.reverseAdjacency.get(nodeId) ?? [];
  const result: LineageEdge[] = [];
  for (const eId of edgeIds) {
    const edge = graph.edges.get(eId);
    if (edge) result.push(edge);
  }
  return result;
}

/** Get all edges of a specific type. */
export function getEdgesByType<T extends LineageEdgeType>(
  graph: LineageGraph,
  edgeType: T,
): LineageEdge<T>[] {
  const result: LineageEdge<T>[] = [];
  for (const edge of graph.edges.values()) {
    if (edge.type === edgeType) {
      result.push(edge as LineageEdge<T>);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Traversal — ancestors and descendants
// ---------------------------------------------------------------------------

/**
 * Get all ancestor nodes reachable by following incoming edges backwards.
 * Optionally filter by edge types to follow.
 */
export function getAncestors(
  graph: LineageGraph,
  nodeId: NodeId,
  edgeTypes?: LineageEdgeType[],
): LineageNode[] {
  const visited = new Set<NodeId>();
  const result: LineageNode[] = [];
  const stack: NodeId[] = [nodeId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const incoming = graph.reverseAdjacency.get(current) ?? [];

    for (const edgeId of incoming) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

      const sourceId = edge.source;
      if (visited.has(sourceId)) continue;
      visited.add(sourceId);

      const node = graph.nodes.get(sourceId);
      if (node) {
        result.push(node);
        stack.push(sourceId);
      }
    }
  }

  return result;
}

/**
 * Get all descendant nodes reachable by following outgoing edges forward.
 * Optionally filter by edge types to follow.
 */
export function getDescendants(
  graph: LineageGraph,
  nodeId: NodeId,
  edgeTypes?: LineageEdgeType[],
): LineageNode[] {
  const visited = new Set<NodeId>();
  const result: LineageNode[] = [];
  const stack: NodeId[] = [nodeId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const outgoing = graph.adjacency.get(current) ?? [];

    for (const edgeId of outgoing) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      if (edgeTypes && !edgeTypes.includes(edge.type)) continue;

      const targetId = edge.target;
      if (visited.has(targetId)) continue;
      visited.add(targetId);

      const node = graph.nodes.get(targetId);
      if (node) {
        result.push(node);
        stack.push(targetId);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Causal chain
// ---------------------------------------------------------------------------

/**
 * Get the causal chain leading to a specific node, ordered from root to target.
 * Only follows `causal` edges backwards.
 */
export function getCausalChain(
  graph: LineageGraph,
  nodeId: NodeId,
): LineageNode[] {
  const chain: LineageNode[] = [];
  let currentId: NodeId | undefined = nodeId;

  const visited = new Set<NodeId>();

  while (currentId) {
    if (visited.has(currentId)) break; // cycle guard
    visited.add(currentId);

    const node = graph.nodes.get(currentId);
    if (!node) break;
    chain.unshift(node);

    // Find the causal parent (incoming causal edge)
    const incoming = graph.reverseAdjacency.get(currentId) ?? [];
    let parentId: NodeId | undefined;
    for (const edgeId of incoming) {
      const edge = graph.edges.get(edgeId);
      if (edge?.type === 'causal') {
        parentId = edge.source;
        break;
      }
    }
    currentId = parentId;
  }

  return chain;
}

// ---------------------------------------------------------------------------
// Side effect queries
// ---------------------------------------------------------------------------

/** Get all side-effect nodes in the graph. */
export function getSideEffects(graph: LineageGraph): SideEffectNode[] {
  return getNodesByType(graph, 'side_effect');
}

/** Get all side-effect nodes for a specific run. */
export function getSideEffectsByRun(
  graph: LineageGraph,
  runId: string,
): SideEffectNode[] {
  const result: SideEffectNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'side_effect' && node.runId === runId) {
      result.push(node as SideEffectNode);
    }
  }
  return result;
}

/** Get all side-effect nodes targeting a specific external system. */
export function getSideEffectsBySystem(
  graph: LineageGraph,
  systemName: string,
): SideEffectNode[] {
  const result: SideEffectNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type === 'side_effect' && (node as SideEffectNode).meta.targetSystem === systemName) {
      result.push(node as SideEffectNode);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Impact analysis — "what did this event cause?"
// ---------------------------------------------------------------------------

/**
 * Determine the downstream impact of a node: all descendants reachable
 * via causal + produces edges, grouped by type.
 */
export function getImpact(
  graph: LineageGraph,
  nodeId: NodeId,
): {
  events: EventNode[];
  sideEffects: SideEffectNode[];
  externalSystems: LineageNode<'external_system'>[];
} {
  const descendants = getDescendants(graph, nodeId, ['causal', 'produces']);

  const events: EventNode[] = [];
  const sideEffects: SideEffectNode[] = [];
  const externalSystems: LineageNode<'external_system'>[] = [];

  for (const d of descendants) {
    switch (d.type) {
      case 'event':
        events.push(d as EventNode);
        break;
      case 'side_effect':
        sideEffects.push(d as SideEffectNode);
        break;
      case 'external_system':
        externalSystems.push(d as LineageNode<'external_system'>);
        break;
    }
  }

  return { events, sideEffects, externalSystems };
}

// ---------------------------------------------------------------------------
// Subgraph extraction
// ---------------------------------------------------------------------------

/**
 * Extract a subgraph containing only the specified nodes and the edges
 * between them. Recomputes adjacency lists and summary.
 */
export function extractSubgraph(
  graph: LineageGraph,
  nodeIds: Set<NodeId>,
): LineageGraph {
  const nodes = new Map<NodeId, LineageNode>();
  const edges = new Map<EdgeId, LineageEdge>();
  const adjacency = new Map<NodeId, EdgeId[]>();
  const reverseAdjacency = new Map<NodeId, EdgeId[]>();

  // Collect nodes
  for (const nodeId of nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (node) nodes.set(nodeId, node);
  }

  // Collect edges where both source and target are in the subgraph
  for (const edge of graph.edges.values()) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edges.set(edge.id, edge);

      const fwd = adjacency.get(edge.source);
      if (fwd) {
        fwd.push(edge.id);
      } else {
        adjacency.set(edge.source, [edge.id]);
      }

      const rev = reverseAdjacency.get(edge.target);
      if (rev) {
        rev.push(edge.id);
      } else {
        reverseAdjacency.set(edge.target, [edge.id]);
      }
    }
  }

  // Compute summary
  const nodeTypeCounts: Record<LineageNodeType, number> = {
    run: 0, event: 0, side_effect: 0, external_system: 0,
  };
  for (const node of nodes.values()) {
    nodeTypeCounts[node.type]++;
  }

  const edgeTypeCounts: Record<LineageEdgeType, number> = {
    causal: 0, temporal: 0, produces: 0, delegation: 0, data_flow: 0,
  };
  for (const edge of edges.values()) {
    edgeTypeCounts[edge.type]++;
  }

  const summary = {
    nodeCount: nodes.size,
    edgeCount: edges.size,
    nodeTypeCounts,
    edgeTypeCounts,
    runCount: nodeTypeCounts.run,
    externalSystemCount: nodeTypeCounts.external_system,
    sideEffectCount: nodeTypeCounts.side_effect,
    maxCausalDepth: 0, // Not recomputed for subgraph
    hasDelegation: edgeTypeCounts.delegation > 0,
  };

  return { nodes, edges, adjacency, reverseAdjacency, summary };
}

// ---------------------------------------------------------------------------
// Critical path — longest causal chain through the graph
// ---------------------------------------------------------------------------

/**
 * Find the longest causal chain in the graph (critical path).
 * Returns the nodes in order from root to deepest descendant.
 */
export function getCriticalPath(graph: LineageGraph): LineageNode[] {
  // Find all root nodes (no incoming causal edges)
  const roots: NodeId[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'event') continue;
    const incoming = graph.reverseAdjacency.get(node.id) ?? [];
    const hasCausalParent = incoming.some((eId) => {
      const edge = graph.edges.get(eId);
      return edge?.type === 'causal';
    });
    if (!hasCausalParent) {
      roots.push(node.id);
    }
  }

  // BFS/DFS to find longest causal path
  let longestPath: LineageNode[] = [];

  for (const rootId of roots) {
    const stack: Array<{ nodeId: NodeId; path: LineageNode[] }> = [];
    const rootNode = graph.nodes.get(rootId);
    if (!rootNode) continue;
    stack.push({ nodeId: rootId, path: [rootNode] });

    while (stack.length > 0) {
      const { nodeId, path } = stack.pop()!;
      const outgoing = graph.adjacency.get(nodeId) ?? [];

      let hasChild = false;
      for (const edgeId of outgoing) {
        const edge = graph.edges.get(edgeId);
        if (edge?.type !== 'causal') continue;

        const childNode = graph.nodes.get(edge.target);
        if (!childNode) continue;

        hasChild = true;
        stack.push({ nodeId: edge.target, path: [...path, childNode] });
      }

      if (!hasChild && path.length > longestPath.length) {
        longestPath = path;
      }
    }
  }

  return longestPath;
}

// ---------------------------------------------------------------------------
// Graph integrity validation
// ---------------------------------------------------------------------------

/** Validate graph integrity and return any issues found. */
export function validateGraphIntegrity(graph: LineageGraph): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  // Check for dangling edges
  for (const edge of graph.edges.values()) {
    if (!graph.nodes.has(edge.source)) {
      issues.push({
        type: 'dangling_edge_source',
        message: `Edge ${edge.id} has source ${edge.source} which does not exist in graph`,
        relatedNodeIds: [edge.source],
        relatedEdgeIds: [edge.id],
      });
    }
    if (!graph.nodes.has(edge.target)) {
      issues.push({
        type: 'dangling_edge_target',
        message: `Edge ${edge.id} has target ${edge.target} which does not exist in graph`,
        relatedNodeIds: [edge.target],
        relatedEdgeIds: [edge.id],
      });
    }
    if (edge.source === edge.target) {
      issues.push({
        type: 'self_loop',
        message: `Edge ${edge.id} is a self-loop on node ${edge.source}`,
        relatedNodeIds: [edge.source],
        relatedEdgeIds: [edge.id],
      });
    }
  }

  // Check for duplicate edges (same type, source, target)
  const seenEdges = new Set<string>();
  for (const edge of graph.edges.values()) {
    const key = `${edge.type}:${edge.source}:${edge.target}`;
    if (seenEdges.has(key)) {
      issues.push({
        type: 'duplicate_edge',
        message: `Duplicate ${edge.type} edge from ${edge.source} to ${edge.target}`,
        relatedNodeIds: [edge.source, edge.target],
        relatedEdgeIds: [edge.id],
      });
    }
    seenEdges.add(key);
  }

  // Check for event nodes without a corresponding run node
  for (const node of graph.nodes.values()) {
    if (node.type === 'event' && node.runId) {
      const runNodeId = `run:${node.runId}` as NodeId;
      if (!graph.nodes.has(runNodeId)) {
        issues.push({
          type: 'missing_run_node',
          message: `Event node ${node.id} references run ${node.runId} but no run node exists`,
          relatedNodeIds: [node.id],
          relatedEdgeIds: [],
        });
      }
    }
  }

  // Check for orphan nodes (no edges at all, excluding run and external_system nodes)
  for (const node of graph.nodes.values()) {
    if (node.type === 'run' || node.type === 'external_system') continue;
    const hasOutgoing = (graph.adjacency.get(node.id) ?? []).length > 0;
    const hasIncoming = (graph.reverseAdjacency.get(node.id) ?? []).length > 0;
    if (!hasOutgoing && !hasIncoming) {
      issues.push({
        type: 'orphan_node',
        message: `Node ${node.id} has no edges`,
        relatedNodeIds: [node.id],
        relatedEdgeIds: [],
      });
    }
  }

  // Check for cycles in causal edges
  const causalCycles = detectCausalCycles(graph);
  for (const cycle of causalCycles) {
    issues.push({
      type: 'cycle_detected',
      message: `Causal cycle detected involving nodes: ${cycle.join(' → ')}`,
      relatedNodeIds: cycle,
      relatedEdgeIds: [],
    });
  }

  return issues;
}

/**
 * Detect cycles in causal edges using DFS with color marking.
 * Returns arrays of NodeIds involved in each cycle.
 */
function detectCausalCycles(graph: LineageGraph): NodeId[][] {
  const WHITE = 0; // unvisited
  const GRAY = 1;  // in current DFS path
  const BLACK = 2; // fully processed

  const color = new Map<NodeId, number>();
  const parent = new Map<NodeId, NodeId>();
  const cycles: NodeId[][] = [];

  for (const nodeId of graph.nodes.keys()) {
    color.set(nodeId, WHITE);
  }

  function dfs(nodeId: NodeId): void {
    color.set(nodeId, GRAY);

    const outgoing = graph.adjacency.get(nodeId) ?? [];
    for (const edgeId of outgoing) {
      const edge = graph.edges.get(edgeId);
      if (edge?.type !== 'causal') continue;

      const targetId = edge.target;
      const targetColor = color.get(targetId);

      if (targetColor === GRAY) {
        // Found a cycle — trace it back
        const cycle: NodeId[] = [targetId];
        let current = nodeId;
        while (current !== targetId) {
          cycle.unshift(current);
          const p = parent.get(current);
          if (!p) break;
          current = p;
        }
        cycles.push(cycle);
      } else if (targetColor === WHITE) {
        parent.set(targetId, nodeId);
        dfs(targetId);
      }
    }

    color.set(nodeId, BLACK);
  }

  for (const nodeId of graph.nodes.keys()) {
    if (color.get(nodeId) === WHITE) {
      dfs(nodeId);
    }
  }

  return cycles;
}
