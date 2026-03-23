import type { LineageNodeType, LineageEdgeType } from '@tracereplay/graph-model';

// ---------------------------------------------------------------------------
// Node visual configuration
// ---------------------------------------------------------------------------

export interface NodeTypeVisual {
  label: string;
  icon: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

const NODE_VISUALS: Record<LineageNodeType, NodeTypeVisual> = {
  run: {
    label: 'Run',
    icon: '▶',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    borderColor: 'border-slate-400 dark:border-slate-500',
    textColor: 'text-slate-800 dark:text-slate-200',
  },
  event: {
    label: 'Event',
    icon: '•',
    bgColor: 'bg-blue-100 dark:bg-blue-900',
    borderColor: 'border-blue-400 dark:border-blue-500',
    textColor: 'text-blue-800 dark:text-blue-200',
  },
  side_effect: {
    label: 'Side Effect',
    icon: '⚡',
    bgColor: 'bg-amber-100 dark:bg-amber-900',
    borderColor: 'border-amber-400 dark:border-amber-500',
    textColor: 'text-amber-800 dark:text-amber-200',
  },
  external_system: {
    label: 'External System',
    icon: '☁',
    bgColor: 'bg-violet-100 dark:bg-violet-900',
    borderColor: 'border-violet-400 dark:border-violet-500',
    textColor: 'text-violet-800 dark:text-violet-200',
  },
};

/** Get visual configuration for a lineage node type. */
export function getNodeTypeVisual(type: LineageNodeType): NodeTypeVisual {
  return NODE_VISUALS[type];
}

// ---------------------------------------------------------------------------
// Event-type-specific sub-visuals (for event nodes)
// ---------------------------------------------------------------------------

export interface EventNodeVisual {
  icon: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

const EVENT_TYPE_VISUALS: Record<string, EventNodeVisual> = {
  'run.start': { icon: '▶', bgColor: 'bg-slate-100 dark:bg-slate-800', borderColor: 'border-slate-400', textColor: 'text-slate-700 dark:text-slate-200' },
  'run.end': { icon: '■', bgColor: 'bg-slate-100 dark:bg-slate-800', borderColor: 'border-slate-400', textColor: 'text-slate-700 dark:text-slate-200' },
  'run.error': { icon: '✕', bgColor: 'bg-red-100 dark:bg-red-900', borderColor: 'border-red-500', textColor: 'text-red-700 dark:text-red-200' },
  'prompt.input': { icon: '→', bgColor: 'bg-blue-100 dark:bg-blue-900', borderColor: 'border-blue-500', textColor: 'text-blue-700 dark:text-blue-200' },
  'prompt.output': { icon: '←', bgColor: 'bg-blue-100 dark:bg-blue-900', borderColor: 'border-blue-500', textColor: 'text-blue-700 dark:text-blue-200' },
  'context.retrieved': { icon: '📎', bgColor: 'bg-cyan-100 dark:bg-cyan-900', borderColor: 'border-cyan-500', textColor: 'text-cyan-700 dark:text-cyan-200' },
  'context.injected': { icon: '💉', bgColor: 'bg-cyan-100 dark:bg-cyan-900', borderColor: 'border-cyan-500', textColor: 'text-cyan-700 dark:text-cyan-200' },
  'tool.call.start': { icon: '⚙', bgColor: 'bg-green-100 dark:bg-green-900', borderColor: 'border-green-500', textColor: 'text-green-700 dark:text-green-200' },
  'tool.call.end': { icon: '✓', bgColor: 'bg-green-100 dark:bg-green-900', borderColor: 'border-green-500', textColor: 'text-green-700 dark:text-green-200' },
  'tool.call.error': { icon: '✕', bgColor: 'bg-red-100 dark:bg-red-900', borderColor: 'border-red-500', textColor: 'text-red-700 dark:text-red-200' },
  'approval.requested': { icon: '?', bgColor: 'bg-purple-100 dark:bg-purple-900', borderColor: 'border-purple-500', textColor: 'text-purple-700 dark:text-purple-200' },
  'approval.granted': { icon: '✓', bgColor: 'bg-purple-100 dark:bg-purple-900', borderColor: 'border-purple-500', textColor: 'text-purple-700 dark:text-purple-200' },
  'approval.denied': { icon: '✕', bgColor: 'bg-purple-100 dark:bg-purple-900', borderColor: 'border-purple-500', textColor: 'text-purple-700 dark:text-purple-200' },
  'side_effect.executed': { icon: '⚡', bgColor: 'bg-amber-100 dark:bg-amber-900', borderColor: 'border-amber-500', textColor: 'text-amber-700 dark:text-amber-200' },
  'side_effect.failed': { icon: '⚡', bgColor: 'bg-red-100 dark:bg-red-900', borderColor: 'border-red-500', textColor: 'text-red-700 dark:text-red-200' },
  'model.request': { icon: '🤖', bgColor: 'bg-indigo-100 dark:bg-indigo-900', borderColor: 'border-indigo-500', textColor: 'text-indigo-700 dark:text-indigo-200' },
  'model.response': { icon: '🤖', bgColor: 'bg-indigo-100 dark:bg-indigo-900', borderColor: 'border-indigo-500', textColor: 'text-indigo-700 dark:text-indigo-200' },
  'policy.evaluated': { icon: '📋', bgColor: 'bg-orange-100 dark:bg-orange-900', borderColor: 'border-orange-500', textColor: 'text-orange-700 dark:text-orange-200' },
  'policy.violated': { icon: '🚫', bgColor: 'bg-red-100 dark:bg-red-900', borderColor: 'border-red-500', textColor: 'text-red-700 dark:text-red-200' },
};

const DEFAULT_EVENT_VISUAL: EventNodeVisual = {
  icon: '•',
  bgColor: 'bg-gray-100 dark:bg-gray-800',
  borderColor: 'border-gray-400',
  textColor: 'text-gray-700 dark:text-gray-200',
};

/** Get visual configuration for an event sub-type within an event node. */
export function getEventNodeVisual(eventType: string): EventNodeVisual {
  return EVENT_TYPE_VISUALS[eventType] ?? DEFAULT_EVENT_VISUAL;
}

// ---------------------------------------------------------------------------
// Edge visual configuration
// ---------------------------------------------------------------------------

export interface EdgeTypeVisual {
  label: string;
  color: string;
  strokeDasharray?: string;
  animated?: boolean;
}

const EDGE_VISUALS: Record<LineageEdgeType, EdgeTypeVisual> = {
  causal: {
    label: 'Caused by',
    color: '#3b82f6',        // blue-500
  },
  temporal: {
    label: 'Followed by',
    color: '#94a3b8',        // slate-400
    strokeDasharray: '5 5',
  },
  produces: {
    label: 'Produces',
    color: '#f59e0b',        // amber-500
  },
  delegation: {
    label: 'Delegated to',
    color: '#8b5cf6',        // violet-500
    strokeDasharray: '3 3',
    animated: true,
  },
  data_flow: {
    label: 'Data flow',
    color: '#06b6d4',        // cyan-500
    strokeDasharray: '8 4',
  },
};

/** Get visual configuration for an edge type. */
export function getEdgeTypeVisual(type: LineageEdgeType): EdgeTypeVisual {
  return EDGE_VISUALS[type];
}

/** Get all edge visuals for legend rendering. */
export function getAllEdgeVisuals(): Record<LineageEdgeType, EdgeTypeVisual> {
  return EDGE_VISUALS;
}

/** Get all node visuals for legend rendering. */
export function getAllNodeVisuals(): Record<LineageNodeType, NodeTypeVisual> {
  return NODE_VISUALS;
}
