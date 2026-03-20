import type {
  TraceReplayEvent,
  EventType,
  EventId,
  RunId,
  TenantId,
} from '@tracereplay/event-schema';
import type {
  ReplayTimeline,
  TimelineEntry,
  TimelineGap,
  RunSummary,
} from './types.js';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Compare two events for timeline ordering.
 * Primary: timestamp (ascending). Secondary: sequence number (ascending).
 */
function compareEvents(a: TraceReplayEvent, b: TraceReplayEvent): number {
  const tsCmp = a.timestamp.localeCompare(b.timestamp);
  if (tsCmp !== 0) return tsCmp;

  // If timestamps match, fall back to sequence number when available.
  const seqA = a.sequence ?? Number.MAX_SAFE_INTEGER;
  const seqB = b.sequence ?? Number.MAX_SAFE_INTEGER;
  return seqA - seqB;
}

// ---------------------------------------------------------------------------
// Causal depth
// ---------------------------------------------------------------------------

/** Compute depth for every event in the parent→children tree. */
function computeDepths(
  events: TraceReplayEvent[],
  childrenMap: Map<EventId, EventId[]>,
): Map<EventId, number> {
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
    // Guard against cycles — treat as root if parent is not in the event set.
    if (!parentOf.has(parent) && !events.some((e) => e.id === parent)) {
      depths.set(id, 1);
      return 1;
    }
    const d = depth(parent) + 1;
    depths.set(id, d);
    return d;
  }

  for (const e of events) {
    depth(e.id);
  }
  return depths;
}

// ---------------------------------------------------------------------------
// Gap detection
// ---------------------------------------------------------------------------

function detectGaps(
  entries: TimelineEntry[],
  events: TraceReplayEvent[],
): TimelineGap[] {
  const gaps: TimelineGap[] = [];

  const hasType = (t: EventType): boolean => events.some((e) => e.type === t);
  const hasRunStart = hasType('run.start');
  const hasRunEnd = hasType('run.end');

  // Missing run.start
  if (!hasRunStart && events.length > 0) {
    gaps.push({
      type: 'missing_run_start',
      message: 'No run.start event found in the timeline.',
      relatedEventIds: [],
      detectedAtIndex: 0,
    });
  }

  // Missing run.end
  if (!hasRunEnd && events.length > 0) {
    gaps.push({
      type: 'missing_run_end',
      message: 'No run.end event found — the run may still be in progress or telemetry was lost.',
      relatedEventIds: [],
      detectedAtIndex: entries.length - 1,
    });
  }

  // Unclosed tool calls: tool.call.start without a matching tool.call.end or tool.call.error
  const openTools = new Map<string, { eventId: EventId; index: number }>();
  for (const entry of entries) {
    const e = entry.event;
    if (e.type === 'tool.call.start') {
      const key = e.payload.toolId ?? e.payload.toolName;
      openTools.set(key, { eventId: e.id, index: entry.index });
    } else if (e.type === 'tool.call.end' || e.type === 'tool.call.error') {
      const key = e.payload.toolId ?? e.payload.toolName;
      openTools.delete(key);
    }
  }
  for (const [toolKey, { eventId, index }] of openTools) {
    gaps.push({
      type: 'unclosed_tool_call',
      message: `Tool call "${toolKey}" was started but never completed or errored.`,
      relatedEventIds: [eventId],
      detectedAtIndex: index,
    });
  }

  // Orphan tool.call.end without a preceding tool.call.start
  const startedTools = new Set<string>();
  for (const entry of entries) {
    const e = entry.event;
    if (e.type === 'tool.call.start') {
      const key = e.payload.toolId ?? e.payload.toolName;
      startedTools.add(key);
    } else if (e.type === 'tool.call.end') {
      const key = e.payload.toolId ?? e.payload.toolName;
      if (!startedTools.has(key)) {
        gaps.push({
          type: 'orphan_tool_end',
          message: `Tool call end for "${key}" has no matching start event.`,
          relatedEventIds: [e.id],
          detectedAtIndex: entry.index,
        });
      }
    }
  }

  // Unclosed approvals: approval.requested without granted or denied
  const openApprovals = new Map<EventId, number>();
  for (const entry of entries) {
    const e = entry.event;
    if (e.type === 'approval.requested') {
      openApprovals.set(e.id, entry.index);
    } else if (e.type === 'approval.granted' || e.type === 'approval.denied') {
      // Match by parentEventId if present
      if (e.parentEventId && openApprovals.has(e.parentEventId)) {
        openApprovals.delete(e.parentEventId);
      }
    }
  }
  for (const [eventId, index] of openApprovals) {
    gaps.push({
      type: 'unclosed_approval',
      message: 'Approval was requested but no granted or denied event was found.',
      relatedEventIds: [eventId],
      detectedAtIndex: index,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Paired-event duration computation
// ---------------------------------------------------------------------------

/** Compute duration for tool.call.start events by matching end/error events. */
function computePairedDurations(
  entries: TimelineEntry[],
): Map<EventId, number> {
  const durations = new Map<EventId, number>();

  // tool.call.start → tool.call.end/error
  const toolStarts = new Map<string, { id: EventId; ts: string }>();
  for (const entry of entries) {
    const e = entry.event;
    if (e.type === 'tool.call.start') {
      const key = e.payload.toolId ?? e.payload.toolName;
      toolStarts.set(key, { id: e.id, ts: e.timestamp });
    } else if (e.type === 'tool.call.end' || e.type === 'tool.call.error') {
      const key = e.type === 'tool.call.end'
        ? (e.payload.toolId ?? e.payload.toolName)
        : (e.payload.toolId ?? e.payload.toolName);
      const start = toolStarts.get(key);
      if (start) {
        const ms = new Date(e.timestamp).getTime() - new Date(start.ts).getTime();
        if (ms >= 0) durations.set(start.id, ms);
        toolStarts.delete(key);
      }
    }
  }

  return durations;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function buildSummary(
  events: TraceReplayEvent[],
  gaps: TimelineGap[],
): RunSummary {
  if (events.length === 0) {
    return {
      runId: '' as RunId,
      tenantId: '' as TenantId,
      eventCount: 0,
      eventTypeCounts: {},
      hasGaps: false,
      toolCount: 0,
      hasErrors: false,
    };
  }

  const first = events[0]!;
  const last = events[events.length - 1]!;

  // Type counts
  const eventTypeCounts: Partial<Record<EventType, number>> = {};
  for (const e of events) {
    eventTypeCounts[e.type] = (eventTypeCounts[e.type] ?? 0) + 1;
  }

  // Tools
  const toolNames = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool.call.start') {
      toolNames.add(e.payload.toolName);
    }
  }

  // Status from run.end
  let status: RunSummary['status'];
  for (const e of events) {
    if (e.type === 'run.end') {
      status = e.payload.status;
      break;
    }
  }

  // Duration
  const startMs = new Date(first.timestamp).getTime();
  const endMs = new Date(last.timestamp).getTime();
  const durationMs = endMs - startMs;

  return {
    runId: first.runId,
    tenantId: first.tenantId,
    eventCount: events.length,
    eventTypeCounts,
    startTime: first.timestamp,
    endTime: last.timestamp,
    durationMs: durationMs >= 0 ? durationMs : undefined,
    status,
    hasGaps: gaps.length > 0,
    toolCount: toolNames.size,
    hasErrors: events.some(
      (e) => e.type === 'run.error' || e.type === 'tool.call.error' || e.type === 'side_effect.failed',
    ),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a replay timeline from an unordered set of canonical events.
 *
 * Events are sorted by timestamp (primary) and sequence (secondary).
 * Parent-child causal links are resolved, gaps are detected, and a run
 * summary is computed.
 */
export function buildTimeline(events: readonly TraceReplayEvent[]): ReplayTimeline {
  if (events.length === 0) {
    return {
      entries: [],
      gaps: [],
      summary: buildSummary([], []),
    };
  }

  // 1. Sort events into timeline order.
  const sorted = [...events].sort(compareEvents);

  // 2. Build parent → children map.
  const childrenMap = new Map<EventId, EventId[]>();
  for (const e of sorted) {
    if (e.parentEventId) {
      const siblings = childrenMap.get(e.parentEventId);
      if (siblings) {
        siblings.push(e.id);
      } else {
        childrenMap.set(e.parentEventId, [e.id]);
      }
    }
  }

  // 3. Compute causal depths.
  const depths = computeDepths(sorted, childrenMap);

  // 4. Assemble timeline entries.
  const entries: TimelineEntry[] = sorted.map((event, index) => ({
    event,
    index,
    depth: depths.get(event.id) ?? 0,
    childEventIds: childrenMap.get(event.id) ?? [],
  }));

  // 5. Compute paired durations (tool call start → end).
  const durations = computePairedDurations(entries);
  for (const entry of entries) {
    const d = durations.get(entry.event.id);
    if (d !== undefined) {
      entry.durationMs = d;
    }
  }

  // 6. Detect gaps.
  const gaps = detectGaps(entries, sorted);

  // 7. Build summary.
  const summary = buildSummary(sorted, gaps);

  return { entries, gaps, summary };
}
