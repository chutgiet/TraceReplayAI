/**
 * Abstract base class for agent-framework adapters.
 *
 * Provides the common normalize/canHandle flow so that concrete vendor adapters
 * only need to supply:
 *   1. Type patterns for detection (`getTypePatterns`)
 *   2. A vendor-type → canonical-type resolver (`resolveCanonicalType`)
 *   3. A payload builder per canonical type (`buildPayload`)
 *
 * Optionally override `getFieldMapping()` if the vendor uses non-standard
 * field names for the trace envelope (e.g. `session_id` instead of `trace_id`).
 */

import type { EventType, TraceReplayEvent } from '@tracereplay/event-schema';
import type {
  NormalizerAdapter,
  NormalizationResult,
  RawVendorEvent,
} from './types.js';
import {
  toEventId,
  toRunId,
  toTenantId,
  isoTimestamp,
  createCanonicalEvent,
  type BaseEventFields,
} from './adapter-utils.js';

// ---------------------------------------------------------------------------
// Vendor trace envelope — generic shape expected from any agent framework
// ---------------------------------------------------------------------------

export interface VendorTraceEvent {
  type: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  timestamp?: string;
  agentName?: string;
  /** Nested payload data (varies per vendor). */
  data: Record<string, unknown>;
}

/**
 * Describes how to extract trace envelope fields from a raw vendor event.
 * Different vendors use different field names for the same concepts.
 */
export interface TraceFieldMapping {
  /** Field name for the event type string. Default: `'type'` */
  type: string;
  /** Field name for trace/session ID. Default: `'trace_id'` */
  traceId: string;
  /** Field name for span/event ID. Default: `'span_id'` */
  spanId: string;
  /** Field name for parent span ID. Default: `'parent_span_id'` */
  parentSpanId: string;
  /** Field name for timestamp. Default: `'timestamp'` */
  timestamp: string;
  /** Field name for agent/session name. Default: `'agent_name'` */
  agentName: string;
  /**
   * Field name for the nested data payload. Default: `'data'`.
   * Set to `null` if the vendor puts all fields at the top level.
   */
  dataField: string | null;
}

export const DEFAULT_FIELD_MAPPING: TraceFieldMapping = {
  type: 'type',
  traceId: 'trace_id',
  spanId: 'span_id',
  parentSpanId: 'parent_span_id',
  timestamp: 'timestamp',
  agentName: 'agent_name',
  dataField: 'data',
};

// ---------------------------------------------------------------------------
// Abstract base adapter
// ---------------------------------------------------------------------------

export abstract class BaseAgentAdapter implements NormalizerAdapter {
  abstract readonly vendorId: string;
  abstract readonly displayName: string;

  /** Framework identifier used in `sourceFramework` on canonical events. */
  protected abstract readonly sourceFramework: string;

  /**
   * String patterns used by `canHandle()`. An event matches if its type
   * field **starts with** any pattern or **exactly equals** one.
   */
  protected abstract getTypePatterns(): readonly string[];

  /**
   * Maps a vendor-specific event type string to a canonical `EventType`.
   * Return `undefined` for unsupported types.
   */
  protected abstract resolveCanonicalType(vendorType: string): EventType | undefined;

  /**
   * Builds the payload for a canonical event from vendor-specific data.
   * Return `undefined` if the vendor type cannot be mapped.
   *
   * @param canonicalType - The resolved canonical event type
   * @param vendorType    - The original vendor type string
   * @param data          - Nested data payload from the vendor trace
   * @param trace         - Full extracted vendor trace envelope
   */
  protected abstract buildPayload(
    canonicalType: EventType,
    vendorType: string,
    data: Record<string, unknown>,
    trace: VendorTraceEvent,
  ): Record<string, unknown> | undefined;

  /**
   * Override to customise trace envelope field extraction.
   * Default uses standard field names (`type`, `trace_id`, `span_id`, …).
   */
  protected getFieldMapping(): TraceFieldMapping {
    return DEFAULT_FIELD_MAPPING;
  }

  // -----------------------------------------------------------------------
  // NormalizerAdapter implementation
  // -----------------------------------------------------------------------

  canHandle(raw: RawVendorEvent): boolean {
    const type = raw.data[this.getFieldMapping().type];
    if (typeof type !== 'string') return false;
    return this.getTypePatterns().some((p) => type.startsWith(p) || type === p);
  }

  normalize(raw: RawVendorEvent): NormalizationResult {
    try {
      const trace = this.extractTrace(raw);

      if (!trace.type) {
        return {
          status: 'error',
          reason: `Missing "type" field in ${this.displayName} trace event`,
          rawEvent: raw,
        };
      }

      const canonicalType = this.resolveCanonicalType(trace.type);
      if (!canonicalType) {
        return {
          status: 'error',
          reason: `Unsupported ${this.displayName} trace type: ${trace.type}`,
          rawEvent: raw,
        };
      }

      const baseFields = this.buildBaseFields(raw, trace);
      const events = this.mapToEvents(
        canonicalType,
        trace.type,
        trace.data,
        trace,
        baseFields,
      );

      if (!events || events.length === 0) {
        return {
          status: 'error',
          reason: `Failed to build payload for ${trace.type} → ${canonicalType}`,
          rawEvent: raw,
        };
      }

      return { status: 'success', events };
    } catch (err) {
      return {
        status: 'error',
        reason: `${this.displayName} adapter error: ${err instanceof Error ? err.message : String(err)}`,
        rawEvent: raw,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Protected helpers — subclasses may override
  // -----------------------------------------------------------------------

  /**
   * Build one or more canonical events from a vendor trace.
   *
   * The default implementation delegates to `buildPayload()` and wraps the
   * result in a single-element array. Override this method if a single vendor
   * event needs to produce multiple canonical events.
   */
  protected mapToEvents(
    canonicalType: EventType,
    vendorType: string,
    data: Record<string, unknown>,
    trace: VendorTraceEvent,
    baseFields: BaseEventFields,
  ): TraceReplayEvent[] | undefined {
    const payload = this.buildPayload(canonicalType, vendorType, data, trace);
    if (!payload) return undefined;

    return [
      createCanonicalEvent(canonicalType, payload, baseFields, {
        sourceFramework: this.sourceFramework,
        tags: [this.vendorId],
      }),
    ];
  }

  /** Extract the vendor trace envelope from raw data using field mapping. */
  protected extractTrace(raw: RawVendorEvent): VendorTraceEvent {
    const fm = this.getFieldMapping();
    const top = raw.data;

    const data = fm.dataField
      ? ((top[fm.dataField] as Record<string, unknown>) ?? {})
      : top;

    return {
      type: String(top[fm.type] ?? ''),
      traceId: typeof top[fm.traceId] === 'string' ? (top[fm.traceId] as string) : undefined,
      spanId: typeof top[fm.spanId] === 'string' ? (top[fm.spanId] as string) : undefined,
      parentSpanId: typeof top[fm.parentSpanId] === 'string' ? (top[fm.parentSpanId] as string) : undefined,
      timestamp: typeof top[fm.timestamp] === 'string' ? (top[fm.timestamp] as string) : undefined,
      agentName: typeof top[fm.agentName] === 'string' ? (top[fm.agentName] as string) : undefined,
      data,
    };
  }

  /** Assemble common base fields for a canonical event. */
  protected buildBaseFields(
    raw: RawVendorEvent,
    trace: VendorTraceEvent,
  ): BaseEventFields {
    return {
      id: toEventId(trace.spanId),
      runId: toRunId(raw.runId ?? trace.traceId),
      tenantId: toTenantId(raw.tenantId),
      timestamp: isoTimestamp(trace.timestamp),
      sourceAgent: trace.agentName ?? `${this.vendorId}-agent`,
      parentEventId: trace.parentSpanId
        ? toEventId(trace.parentSpanId)
        : undefined,
      rawMeta: {
        normalizedBy: this.vendorId,
        receivedAt: raw.receivedAt,
        originalType: trace.type,
        traceId: trace.traceId,
        spanId: trace.spanId,
        ...raw.data,
      },
    };
  }
}
