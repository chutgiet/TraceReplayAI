import type {
  NodeId,
  EdgeId,
  LineageNode,
  LineageEdge,
  LineageGraph,
  LineageGraphSummary,
  LineageNodeType,
  LineageEdgeType,
} from './types.js';
import type { SerializedLineageGraph } from './validators.js';

// ---------------------------------------------------------------------------
// Serialization — LineageGraph ↔ JSON-serializable format
// ---------------------------------------------------------------------------

/**
 * Serialize a LineageGraph to a JSON-safe format (Map → Array).
 * Use this when persisting to a database, sending over an API, or encoding to JSON.
 */
export function serializeGraph(graph: LineageGraph): SerializedLineageGraph {
  return {
    nodes: Array.from(graph.nodes.values()) as unknown as SerializedLineageGraph['nodes'],
    edges: Array.from(graph.edges.values()) as unknown as SerializedLineageGraph['edges'],
    summary: graph.summary,
  };
}

/**
 * Deserialize a serialized graph back into a LineageGraph with Maps and adjacency lists.
 */
export function deserializeGraph(serialized: SerializedLineageGraph): LineageGraph {
  const nodes = new Map<NodeId, LineageNode>();
  const edges = new Map<EdgeId, LineageEdge>();
  const adjacency = new Map<NodeId, EdgeId[]>();
  const reverseAdjacency = new Map<NodeId, EdgeId[]>();

  for (const node of serialized.nodes) {
    nodes.set(node.id as NodeId, node as unknown as LineageNode);
  }

  for (const edge of serialized.edges) {
    const typedEdge = edge as unknown as LineageEdge;
    edges.set(typedEdge.id, typedEdge);

    const source = typedEdge.source;
    const target = typedEdge.target;

    const fwd = adjacency.get(source);
    if (fwd) {
      fwd.push(typedEdge.id);
    } else {
      adjacency.set(source, [typedEdge.id]);
    }

    const rev = reverseAdjacency.get(target);
    if (rev) {
      rev.push(typedEdge.id);
    } else {
      reverseAdjacency.set(target, [typedEdge.id]);
    }
  }

  const summary: LineageGraphSummary = {
    nodeCount: serialized.summary.nodeCount,
    edgeCount: serialized.summary.edgeCount,
    nodeTypeCounts: serialized.summary.nodeTypeCounts as Record<LineageNodeType, number>,
    edgeTypeCounts: serialized.summary.edgeTypeCounts as Record<LineageEdgeType, number>,
    runCount: serialized.summary.runCount,
    externalSystemCount: serialized.summary.externalSystemCount,
    sideEffectCount: serialized.summary.sideEffectCount,
    maxCausalDepth: serialized.summary.maxCausalDepth,
    hasDelegation: serialized.summary.hasDelegation,
  };

  return { nodes, edges, adjacency, reverseAdjacency, summary };
}
