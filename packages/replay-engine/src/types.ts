import type {
  TraceReplayEvent,
  EventType,
  RunId,
  EventId,
  TenantId,
} from '@tracereplay/event-schema';

// ---------------------------------------------------------------------------
// Timeline entry
// ---------------------------------------------------------------------------

/** A single entry positioned in the replay timeline. */
export interface TimelineEntry {
  /** The canonical event. */
  event: TraceReplayEvent;
  /** Zero-based position in the sorted timeline. */
  index: number;
  /** Depth in the causal tree (0 = root-level, no parent). */
  depth: number;
  /** IDs of direct child events (those whose parentEventId === this event's id). */
  childEventIds: EventId[];
  /** Computed duration in ms for paired start→end events. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Gap detection
// ---------------------------------------------------------------------------

/** Category of detected timeline gap. */
export type TimelineGapType =
  | 'missing_run_start'
  | 'missing_run_end'
  | 'orphan_tool_end'
  | 'unclosed_tool_call'
  | 'unclosed_approval';

/** A detected gap or inconsistency in the timeline. */
export interface TimelineGap {
  /** Kind of gap. */
  type: TimelineGapType;
  /** Human-readable description. */
  message: string;
  /** Event IDs related to this gap. */
  relatedEventIds: EventId[];
  /** Timeline index where the gap was detected. */
  detectedAtIndex?: number;
}

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

/** Summary statistics computed from a run's timeline. */
export interface RunSummary {
  /** Run ID. */
  runId: RunId;
  /** Tenant ID (from first event). */
  tenantId: TenantId;
  /** Total number of events in the timeline. */
  eventCount: number;
  /** Event count broken down by type. */
  eventTypeCounts: Partial<Record<EventType, number>>;
  /** ISO 8601 timestamp of the earliest event. */
  startTime?: string;
  /** ISO 8601 timestamp of the latest event. */
  endTime?: string;
  /** Total run duration in ms (computed from timestamps). */
  durationMs?: number;
  /** Run outcome status (from run.end payload, if present). */
  status?: 'success' | 'failure' | 'timeout' | 'cancelled';
  /** Whether gaps were detected. */
  hasGaps: boolean;
  /** Number of distinct tools invoked. */
  toolCount: number;
  /** Whether any error events exist. */
  hasErrors: boolean;
}

// ---------------------------------------------------------------------------
// Replay result
// ---------------------------------------------------------------------------

/** Complete result of timeline construction. */
export interface ReplayTimeline {
  /** Events ordered into a timeline with computed metadata. */
  entries: TimelineEntry[];
  /** Detected gaps and inconsistencies. */
  gaps: TimelineGap[];
  /** Aggregate summary of the run. */
  summary: RunSummary;
}
