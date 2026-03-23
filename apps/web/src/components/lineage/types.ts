import type { LineageNodeType, LineageEdgeType } from '@tracereplay/graph-model';

/** Data payload attached to each React Flow node. */
export type LineageNodeData = {
  /** Original graph-model node type. */
  nodeType: LineageNodeType;
  /** Human-readable label for the node. */
  label: string;
  /** Event type (only for event nodes). */
  eventType?: string;
  /** Source event ID for drill-down. */
  sourceEventId?: string;
  /** Run ID this node belongs to. */
  runId?: string;
  /** Whether the node is currently selected. */
  selected?: boolean;
  /** Extra metadata for tooltip / detail display. */
  meta: Record<string, unknown>;
  [key: string]: unknown;
};

/** Data payload attached to each React Flow edge. */
export type LineageEdgeData = {
  /** Original graph-model edge type. */
  edgeType: LineageEdgeType;
  /** Human-readable label for the edge. */
  label?: string;
  /** Extra metadata for tooltip display. */
  meta: Record<string, unknown>;
  [key: string]: unknown;
};
