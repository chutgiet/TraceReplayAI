import type {
  TraceReplayEvent,
  EventId,
  RunId,
  TenantId,
  RunStartPayload,
  RunEndPayload,
  SideEffectExecutedPayload,
  SideEffectFailedPayload,
} from '@tracereplay/event-schema';
import type {
  NodeId,
  EdgeId,
  LineageNode,
  LineageEdge,
  LineageGraph,
  LineageGraphSummary,
  BuildGraphOptions,
  RunNodeMeta,
  EventNodeMeta,
  SideEffectNodeMeta,
  ExternalSystemNodeMeta,
  LineageNodeType,
  LineageEdgeType,
} from './types.js';
import { DATA_FLOW_PAIRS } from './constants.js';

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

/** Create a NodeId from a run ID. */
function runNodeId(runId: RunId): NodeId {
  return `run:${runId}` as NodeId;
}

/** Create a NodeId from an event ID. */
function eventNodeId(eventId: EventId): NodeId {
  return `event:${eventId}` as NodeId;
}

/** Create a NodeId for a side-effect event. */
function sideEffectNodeId(eventId: EventId): NodeId {
  return `side_effect:${eventId}` as NodeId;
}

/** Create a NodeId for an external system. */
function externalSystemNodeId(systemName: string): NodeId {
  return `external_system:${systemName}` as NodeId;
}

let edgeCounter = 0;

/** Generate a unique edge ID. */
function nextEdgeId(type: LineageEdgeType, source: NodeId, target: NodeId): EdgeId {
  edgeCounter++;
  return `${type}:${source}->${target}:${edgeCounter}` as EdgeId;
}

/** Reset the internal edge counter (for testing determinism). */
export function resetEdgeCounter(): void {
  edgeCounter = 0;
}

// ---------------------------------------------------------------------------
// Event sorting (same logic as replay-engine)
// ---------------------------------------------------------------------------

function compareEvents(a: TraceReplayEvent, b: TraceReplayEvent): number {
  const tsCmp = a.timestamp.localeCompare(b.timestamp);
  if (tsCmp !== 0) return tsCmp;
  const seqA = a.sequence ?? Number.MAX_SAFE_INTEGER;
  const seqB = b.sequence ?? Number.MAX_SAFE_INTEGER;
  return seqA - seqB;
}

// ---------------------------------------------------------------------------
// Label extraction — human-readable summary from event payload
// ---------------------------------------------------------------------------

function extractLabel(event: TraceReplayEvent): string | undefined {
  switch (event.type) {
    case 'run.start':
      return event.payload.runName ?? 'Run started';
    case 'run.end':
      return `Run ended: ${event.payload.status}`;
    case 'run.error':
      return `Error: ${event.payload.errorMessage}`;
    case 'prompt.input':
      return `${event.payload.role} prompt (${event.payload.tokenCount ?? '?'} tokens)`;
    case 'prompt.output':
      return `Output (${event.payload.tokenCount ?? '?'} tokens)`;
    case 'context.retrieved':
      return `Retrieved from ${event.payload.source}`;
    case 'context.injected':
      return `Injected from ${event.payload.source}`;
    case 'tool.call.start':
      return `Tool: ${event.payload.toolName}`;
    case 'tool.call.end':
      return `Tool done: ${event.payload.toolName} (${event.payload.success ? 'ok' : 'failed'})`;
    case 'tool.call.error':
      return `Tool error: ${event.payload.toolName}`;
    case 'approval.requested':
      return `Approval: ${event.payload.requestedAction}`;
    case 'approval.granted':
      return 'Approval granted';
    case 'approval.denied':
      return 'Approval denied';
    case 'side_effect.executed':
      return `Side effect: ${event.payload.description}`;
    case 'side_effect.failed':
      return `Side effect failed: ${event.payload.description}`;
    case 'model.request':
      return `Model: ${event.payload.modelId}`;
    case 'model.response':
      return `Model response: ${event.payload.modelId}`;
    case 'policy.evaluated':
      return `Policy: ${event.payload.policyName} (${event.payload.result})`;
    case 'policy.violated':
      return `Policy violated: ${event.payload.policyName}`;
    case 'annotation':
      return `Annotation: ${event.payload.key}`;
    case 'custom':
      return event.payload.customType ?? 'Custom event';
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

function buildRunNode(
  runId: RunId,
  tenantId: TenantId,
  events: TraceReplayEvent[],
): LineageNode<'run'> {
  const startEvent = events.find((e) => e.type === 'run.start');
  const endEvent = events.find((e) => e.type === 'run.end');

  const startPayload = startEvent?.payload as RunStartPayload | undefined;
  const endPayload = endEvent?.payload as RunEndPayload | undefined;

  const startTime = startEvent?.timestamp;
  const endTime = endEvent?.timestamp;
  let durationMs: number | undefined;
  if (startTime && endTime) {
    const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
    if (ms >= 0) durationMs = ms;
  }

  const meta: RunNodeMeta = {
    agentId: events[0]?.sourceAgent ?? 'unknown',
    runName: startPayload?.runName,
    triggerSource: startPayload?.triggerSource,
    status: endPayload?.status ?? 'running',
    startTime,
    endTime,
    durationMs,
    parentRunId: startPayload?.parentRunId,
  };

  return {
    id: runNodeId(runId),
    type: 'run',
    runId,
    tenantId,
    meta,
  };
}

function buildEventNode(
  event: TraceReplayEvent,
): LineageNode<'event'> {
  const meta: EventNodeMeta = {
    eventType: event.type,
    sourceAgent: event.sourceAgent,
    sourceFramework: event.sourceFramework,
    timestamp: event.timestamp,
    sequence: event.sequence,
    label: extractLabel(event),
  };

  return {
    id: eventNodeId(event.id),
    type: 'event',
    runId: event.runId,
    tenantId: event.tenantId,
    meta,
    sourceEventId: event.id,
  };
}

function buildSideEffectNode(
  event: TraceReplayEvent,
): LineageNode<'side_effect'> | null {
  if (event.type === 'side_effect.executed') {
    const p = event.payload as SideEffectExecutedPayload;
    const meta: SideEffectNodeMeta = {
      effectType: p.effectType,
      targetSystem: p.targetSystem,
      description: p.description,
      reversible: p.reversible,
      success: true,
    };
    return {
      id: sideEffectNodeId(event.id),
      type: 'side_effect',
      runId: event.runId,
      tenantId: event.tenantId,
      meta,
      sourceEventId: event.id,
    };
  }

  if (event.type === 'side_effect.failed') {
    const p = event.payload as SideEffectFailedPayload;
    const meta: SideEffectNodeMeta = {
      effectType: p.effectType,
      targetSystem: p.targetSystem,
      description: p.description,
      reversible: false,
      success: false,
      errorMessage: p.errorMessage,
    };
    return {
      id: sideEffectNodeId(event.id),
      type: 'side_effect',
      runId: event.runId,
      tenantId: event.tenantId,
      meta,
      sourceEventId: event.id,
    };
  }

  return null;
}

function buildExternalSystemNode(
  systemName: string,
  tenantId: TenantId,
  effectCount: number,
): LineageNode<'external_system'> {
  const meta: ExternalSystemNodeMeta = {
    systemName,
    effectCount,
  };
  return {
    id: externalSystemNodeId(systemName),
    type: 'external_system',
    tenantId,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

function addEdge(
  edges: Map<EdgeId, LineageEdge>,
  adjacency: Map<NodeId, EdgeId[]>,
  reverseAdjacency: Map<NodeId, EdgeId[]>,
  edge: LineageEdge,
): void {
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

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function buildSummary(
  nodes: Map<NodeId, LineageNode>,
  edges: Map<EdgeId, LineageEdge>,
  maxCausalDepth: number,
): LineageGraphSummary {
  const nodeTypeCounts: Record<LineageNodeType, number> = {
    run: 0,
    event: 0,
    side_effect: 0,
    external_system: 0,
  };
  for (const node of nodes.values()) {
    nodeTypeCounts[node.type]++;
  }

  const edgeTypeCounts: Record<LineageEdgeType, number> = {
    causal: 0,
    temporal: 0,
    produces: 0,
    delegation: 0,
    data_flow: 0,
  };
  for (const edge of edges.values()) {
    edgeTypeCounts[edge.type]++;
  }

  return {
    nodeCount: nodes.size,
    edgeCount: edges.size,
    nodeTypeCounts,
    edgeTypeCounts,
    runCount: nodeTypeCounts.run,
    externalSystemCount: nodeTypeCounts.external_system,
    sideEffectCount: nodeTypeCounts.side_effect,
    maxCausalDepth,
    hasDelegation: edgeTypeCounts.delegation > 0,
  };
}

// ---------------------------------------------------------------------------
// Causal depth computation
// ---------------------------------------------------------------------------

function computeMaxCausalDepth(
  events: TraceReplayEvent[],
): number {
  const parentOf = new Map<EventId, EventId>();
  for (const e of events) {
    if (e.parentEventId) {
      parentOf.set(e.id, e.parentEventId);
    }
  }

  const depths = new Map<EventId, number>();

  function depth(id: EventId): number {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;

    const parent = parentOf.get(id);
    if (!parent) {
      depths.set(id, 0);
      return 0;
    }
    const d = depth(parent) + 1;
    depths.set(id, d);
    return d;
  }

  let max = 0;
  for (const e of events) {
    const d = depth(e.id);
    if (d > max) max = d;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Data flow edge detection
// ---------------------------------------------------------------------------

/**
 * Detect data_flow edges between events based on known type pairs.
 * Uses adjacency (next event of the target type within a window)
 * and parent-child relationships for more precise linking.
 */
function detectDataFlowEdges(
  sorted: TraceReplayEvent[],
  nodes: Map<NodeId, LineageNode>,
  edges: Map<EdgeId, LineageEdge>,
  adjacency: Map<NodeId, EdgeId[]>,
  reverseAdjacency: Map<NodeId, EdgeId[]>,
): void {
  // Build index of events by type for each run
  const runTypeIndex = new Map<string, Map<string, TraceReplayEvent[]>>();
  for (const e of sorted) {
    let typeMap = runTypeIndex.get(e.runId);
    if (!typeMap) {
      typeMap = new Map();
      runTypeIndex.set(e.runId, typeMap);
    }
    let list = typeMap.get(e.type);
    if (!list) {
      list = [];
      typeMap.set(e.type, list);
    }
    list.push(e);
  }

  for (const [_runId, typeMap] of runTypeIndex) {
    for (const [sourceType, targetType, description] of DATA_FLOW_PAIRS) {
      const sources = typeMap.get(sourceType);
      const targets = typeMap.get(targetType);
      if (!sources || !targets) continue;

      // For each source event, find the nearest following target event
      let targetIdx = 0;
      for (const srcEvent of sources) {
        const srcTime = new Date(srcEvent.timestamp).getTime();

        // Advance target index to find the first target after (or at) the source
        while (
          targetIdx < targets.length &&
          new Date(targets[targetIdx]!.timestamp).getTime() < srcTime
        ) {
          targetIdx++;
        }

        if (targetIdx < targets.length) {
          const tgtEvent = targets[targetIdx]!;
          const srcNodeId = eventNodeId(srcEvent.id);
          const tgtNodeId = eventNodeId(tgtEvent.id);

          // Only add if both nodes exist
          if (nodes.has(srcNodeId) && nodes.has(tgtNodeId)) {
            const edge: LineageEdge<'data_flow'> = {
              id: nextEdgeId('data_flow', srcNodeId, tgtNodeId),
              type: 'data_flow',
              source: srcNodeId,
              target: tgtNodeId,
              meta: { description },
            };
            addEdge(edges, adjacency, reverseAdjacency, edge);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — buildLineageGraph
// ---------------------------------------------------------------------------

/**
 * Build a lineage graph from a set of canonical events.
 *
 * Creates nodes for runs, events, side effects, and external systems.
 * Creates edges for causal links, temporal ordering, data flow,
 * side-effect production, and sub-agent delegation.
 */
export function buildLineageGraph(
  events: readonly TraceReplayEvent[],
  options: BuildGraphOptions = {},
): LineageGraph {
  const {
    includeTemporal = true,
    includeDataFlow = true,
    relatedRunEvents = [],
  } = options;

  resetEdgeCounter();

  const allEvents = [...events, ...relatedRunEvents];
  const sorted = [...allEvents].sort(compareEvents);

  const nodes = new Map<NodeId, LineageNode>();
  const edges = new Map<EdgeId, LineageEdge>();
  const adjacency = new Map<NodeId, EdgeId[]>();
  const reverseAdjacency = new Map<NodeId, EdgeId[]>();

  // ---- Group events by runId ----
  const runGroups = new Map<RunId, TraceReplayEvent[]>();
  for (const e of sorted) {
    let group = runGroups.get(e.runId);
    if (!group) {
      group = [];
      runGroups.set(e.runId, group);
    }
    group.push(e);
  }

  // ---- 1. Create run nodes ----
  for (const [runId, runEvents] of runGroups) {
    const tenantId = runEvents[0]!.tenantId;
    const runNode = buildRunNode(runId, tenantId, runEvents);
    nodes.set(runNode.id, runNode);
  }

  // ---- 2. Create event nodes ----
  for (const event of sorted) {
    const node = buildEventNode(event);
    nodes.set(node.id, node);
  }

  // ---- 3. Create side-effect nodes + produces edges ----
  const systemEffectCounts = new Map<string, number>();
  for (const event of sorted) {
    const seNode = buildSideEffectNode(event);
    if (seNode) {
      nodes.set(seNode.id, seNode);

      // Edge: event → side_effect
      const sourceNodeId = eventNodeId(event.id);
      const edge: LineageEdge<'produces'> = {
        id: nextEdgeId('produces', sourceNodeId, seNode.id),
        type: 'produces',
        source: sourceNodeId,
        target: seNode.id,
        meta: {
          effectType: seNode.meta.effectType,
          targetSystem: seNode.meta.targetSystem,
        },
      };
      addEdge(edges, adjacency, reverseAdjacency, edge);

      // Track external system counts
      const current = systemEffectCounts.get(seNode.meta.targetSystem) ?? 0;
      systemEffectCounts.set(seNode.meta.targetSystem, current + 1);
    }
  }

  // ---- 4. Create external system nodes + side_effect→external_system edges ----
  const firstTenantId = sorted[0]?.tenantId ?? ('' as TenantId);
  for (const [systemName, effectCount] of systemEffectCounts) {
    const sysNode = buildExternalSystemNode(systemName, firstTenantId, effectCount);
    nodes.set(sysNode.id, sysNode);

    // Connect each side_effect node to the external system
    for (const node of nodes.values()) {
      if (
        node.type === 'side_effect' &&
        (node as LineageNode<'side_effect'>).meta.targetSystem === systemName
      ) {
        const edge: LineageEdge<'produces'> = {
          id: nextEdgeId('produces', node.id, sysNode.id),
          type: 'produces',
          source: node.id,
          target: sysNode.id,
          meta: {
            effectType: (node as LineageNode<'side_effect'>).meta.effectType,
            targetSystem: systemName,
          },
        };
        addEdge(edges, adjacency, reverseAdjacency, edge);
      }
    }
  }

  // ---- 5. Create causal edges (parentEventId → child) ----
  for (const event of sorted) {
    if (event.parentEventId) {
      const sourceId = eventNodeId(event.parentEventId);
      const targetId = eventNodeId(event.id);
      if (nodes.has(sourceId) && nodes.has(targetId)) {
        const edge: LineageEdge<'causal'> = {
          id: nextEdgeId('causal', sourceId, targetId),
          type: 'causal',
          source: sourceId,
          target: targetId,
          meta: { parentEventId: event.parentEventId },
        };
        addEdge(edges, adjacency, reverseAdjacency, edge);
      }
    }
  }

  // ---- 6. Create temporal edges between adjacent events in each run ----
  if (includeTemporal) {
    for (const [_runId, runEvents] of runGroups) {
      for (let i = 0; i < runEvents.length - 1; i++) {
        const current = runEvents[i]!;
        const next = runEvents[i + 1]!;
        const sourceId = eventNodeId(current.id);
        const targetId = eventNodeId(next.id);

        const gapMs =
          new Date(next.timestamp).getTime() -
          new Date(current.timestamp).getTime();

        const edge: LineageEdge<'temporal'> = {
          id: nextEdgeId('temporal', sourceId, targetId),
          type: 'temporal',
          source: sourceId,
          target: targetId,
          meta: { gapMs },
        };
        addEdge(edges, adjacency, reverseAdjacency, edge);
      }
    }
  }

  // ---- 7. Create delegation edges for sub-agent runs ----
  for (const [_runId, runEvents] of runGroups) {
    const startEvent = runEvents.find((e) => e.type === 'run.start');
    if (!startEvent) continue;

    const startPayload = startEvent.payload as RunStartPayload;
    if (startPayload.parentRunId) {
      const parentRunNodeId = runNodeId(startPayload.parentRunId as RunId);
      const childRunNodeId = runNodeId(startEvent.runId);

      if (nodes.has(parentRunNodeId) && nodes.has(childRunNodeId)) {
        const edge: LineageEdge<'delegation'> = {
          id: nextEdgeId('delegation', parentRunNodeId, childRunNodeId),
          type: 'delegation',
          source: parentRunNodeId,
          target: childRunNodeId,
          meta: {
            parentRunId: startPayload.parentRunId as RunId,
            childRunId: startEvent.runId,
          },
        };
        addEdge(edges, adjacency, reverseAdjacency, edge);
      }
    }
  }

  // ---- 8. Detect data flow edges ----
  if (includeDataFlow) {
    detectDataFlowEdges(sorted, nodes, edges, adjacency, reverseAdjacency);
  }

  // ---- 9. Build summary ----
  const maxCausalDepth = computeMaxCausalDepth(sorted);
  const summary = buildSummary(nodes, edges, maxCausalDepth);

  return { nodes, edges, adjacency, reverseAdjacency, summary };
}
