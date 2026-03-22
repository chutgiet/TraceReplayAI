import type {
  EventId,
  RunId,
  TenantId,
  EventType,
  TraceReplayEvent,
} from '@tracereplay/event-schema';

// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

/** Branded string type for lineage node identifiers. */
export type NodeId = string & { readonly __brand: 'NodeId' };

/** Branded string type for lineage edge identifiers. */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

// ---------------------------------------------------------------------------
// Node type discriminator
// ---------------------------------------------------------------------------

/** Discriminator for lineage node kinds. */
export type LineageNodeType =
  | 'run'
  | 'event'
  | 'side_effect'
  | 'external_system';

// ---------------------------------------------------------------------------
// Edge type discriminator
// ---------------------------------------------------------------------------

/**
 * Discriminator for lineage edge kinds.
 *
 * - `causal`:     Parent → child event (from parentEventId)
 * - `temporal`:   Sequential ordering between adjacent events in a run
 * - `produces`:   Event → side effect it caused
 * - `delegation`: Parent run → sub-agent run (from parentRunId)
 * - `data_flow`:  Data dependency (e.g. context.retrieved → context.injected)
 */
export type LineageEdgeType =
  | 'causal'
  | 'temporal'
  | 'produces'
  | 'delegation'
  | 'data_flow';

// ---------------------------------------------------------------------------
// Node metadata — varies by node type
// ---------------------------------------------------------------------------

export interface RunNodeMeta {
  runName?: string;
  agentId: string;
  triggerSource?: string;
  status?: 'success' | 'failure' | 'timeout' | 'cancelled' | 'running';
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  parentRunId?: string;
}

export interface EventNodeMeta {
  eventType: EventType;
  sourceAgent: string;
  sourceFramework?: string;
  timestamp: string;
  sequence?: number;
  /** Summary extracted from the event payload for display. */
  label?: string;
}

export interface SideEffectNodeMeta {
  effectType: string;
  targetSystem: string;
  description: string;
  reversible: boolean;
  success: boolean;
  errorMessage?: string;
}

export interface ExternalSystemNodeMeta {
  systemName: string;
  /** How many side effects target this system in the current graph. */
  effectCount: number;
}

/** Maps node type to its metadata interface. */
export type NodeMetaMap = {
  run: RunNodeMeta;
  event: EventNodeMeta;
  side_effect: SideEffectNodeMeta;
  external_system: ExternalSystemNodeMeta;
};

// ---------------------------------------------------------------------------
// Lineage node
// ---------------------------------------------------------------------------

/** A node in the lineage graph. */
export interface LineageNode<T extends LineageNodeType = LineageNodeType> {
  /** Unique node identifier. */
  id: NodeId;
  /** Node type discriminator. */
  type: T;
  /** Run this node belongs to (undefined only for cross-run external_system nodes). */
  runId?: RunId;
  /** Tenant/org identifier. */
  tenantId: TenantId;
  /** Type-specific metadata. */
  meta: NodeMetaMap[T];
  /**
   * Original event ID if this node represents a canonical event.
   * Present for `event` and `side_effect` nodes; absent for `run` and `external_system`.
   */
  sourceEventId?: EventId;
}

/** Typed node variants for narrowing. */
export type RunNode = LineageNode<'run'>;
export type EventNode = LineageNode<'event'>;
export type SideEffectNode = LineageNode<'side_effect'>;
export type ExternalSystemNode = LineageNode<'external_system'>;

// ---------------------------------------------------------------------------
// Edge metadata
// ---------------------------------------------------------------------------

export interface CausalEdgeMeta {
  /** The parent event ID that established this causal link. */
  parentEventId: EventId;
}

export interface TemporalEdgeMeta {
  /** Time gap in ms between the source and target events. */
  gapMs: number;
}

export interface ProducesEdgeMeta {
  effectType: string;
  targetSystem: string;
}

export interface DelegationEdgeMeta {
  parentRunId: RunId;
  childRunId: RunId;
}

export interface DataFlowEdgeMeta {
  /** Description of the data relationship. */
  description: string;
}

/** Maps edge type to its metadata interface. */
export type EdgeMetaMap = {
  causal: CausalEdgeMeta;
  temporal: TemporalEdgeMeta;
  produces: ProducesEdgeMeta;
  delegation: DelegationEdgeMeta;
  data_flow: DataFlowEdgeMeta;
};

// ---------------------------------------------------------------------------
// Lineage edge
// ---------------------------------------------------------------------------

/** A directed edge in the lineage graph. */
export interface LineageEdge<T extends LineageEdgeType = LineageEdgeType> {
  /** Unique edge identifier. */
  id: EdgeId;
  /** Edge type discriminator. */
  type: T;
  /** Source node ID (tail of the directed edge). */
  source: NodeId;
  /** Target node ID (head of the directed edge). */
  target: NodeId;
  /** Type-specific metadata. */
  meta: EdgeMetaMap[T];
}

/** Typed edge variants for narrowing. */
export type CausalEdge = LineageEdge<'causal'>;
export type TemporalEdge = LineageEdge<'temporal'>;
export type ProducesEdge = LineageEdge<'produces'>;
export type DelegationEdge = LineageEdge<'delegation'>;
export type DataFlowEdge = LineageEdge<'data_flow'>;

// ---------------------------------------------------------------------------
// Graph summary
// ---------------------------------------------------------------------------

/** Aggregate statistics for the lineage graph. */
export interface LineageGraphSummary {
  /** Total number of nodes. */
  nodeCount: number;
  /** Total number of edges. */
  edgeCount: number;
  /** Node count broken down by type. */
  nodeTypeCounts: Record<LineageNodeType, number>;
  /** Edge count broken down by type. */
  edgeTypeCounts: Record<LineageEdgeType, number>;
  /** Number of distinct runs in the graph. */
  runCount: number;
  /** Number of distinct external systems referenced. */
  externalSystemCount: number;
  /** Number of side effects in the graph. */
  sideEffectCount: number;
  /** Depth of the deepest causal chain. */
  maxCausalDepth: number;
  /** Whether the graph contains sub-agent delegation edges. */
  hasDelegation: boolean;
}

// ---------------------------------------------------------------------------
// Integrity issues
// ---------------------------------------------------------------------------

/** Types of graph integrity issues. */
export type IntegrityIssueType =
  | 'dangling_edge_source'
  | 'dangling_edge_target'
  | 'self_loop'
  | 'duplicate_edge'
  | 'orphan_node'
  | 'missing_run_node'
  | 'cycle_detected';

/** A detected integrity issue in the lineage graph. */
export interface IntegrityIssue {
  type: IntegrityIssueType;
  message: string;
  relatedNodeIds: NodeId[];
  relatedEdgeIds: EdgeId[];
}

// ---------------------------------------------------------------------------
// Lineage graph
// ---------------------------------------------------------------------------

/** Complete lineage graph for one or more runs. */
export interface LineageGraph {
  /** All nodes in the graph, keyed by NodeId for O(1) lookup. */
  nodes: Map<NodeId, LineageNode>;
  /** All edges in the graph, keyed by EdgeId for O(1) lookup. */
  edges: Map<EdgeId, LineageEdge>;
  /** Adjacency list: source NodeId → outgoing EdgeIds. */
  adjacency: Map<NodeId, EdgeId[]>;
  /** Reverse adjacency list: target NodeId → incoming EdgeIds. */
  reverseAdjacency: Map<NodeId, EdgeId[]>;
  /** Graph summary statistics. */
  summary: LineageGraphSummary;
}

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

/** Options for controlling graph construction. */
export interface BuildGraphOptions {
  /** Include temporal (sequential ordering) edges between adjacent events. Default: true. */
  includeTemporal?: boolean;
  /** Include data_flow edges for inferred data dependencies. Default: true. */
  includeDataFlow?: boolean;
  /** Additional runs to link as sub-agent delegations (events from other runs). */
  relatedRunEvents?: readonly TraceReplayEvent[];
}
