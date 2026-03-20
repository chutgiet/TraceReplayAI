import type { TraceReplayEvent } from '@tracereplay/event-schema';

// ---------------------------------------------------------------------------
// Raw vendor event — the unstructured input that adapters consume
// ---------------------------------------------------------------------------

/**
 * A raw event as received from an external vendor/framework.
 * The shape is unknown at this layer — each adapter knows how to interpret it.
 */
export interface RawVendorEvent {
  /** Identifier for the vendor/framework that produced this event. */
  vendor: string;

  /** Raw payload — shape varies per vendor. */
  data: Record<string, unknown>;

  /** ISO 8601 timestamp of when the raw event was received. */
  receivedAt: string;

  /** Tenant context, propagated from ingestion. */
  tenantId: string;

  /** Optional run context if known at ingestion time. */
  runId?: string;
}

// ---------------------------------------------------------------------------
// Normalization result
// ---------------------------------------------------------------------------

export interface NormalizationSuccess {
  status: 'success';
  events: TraceReplayEvent[];
}

export interface NormalizationError {
  status: 'error';
  reason: string;
  /** Original raw event preserved for dead-letter inspection. */
  rawEvent: RawVendorEvent;
}

export type NormalizationResult = NormalizationSuccess | NormalizationError;

// ---------------------------------------------------------------------------
// NormalizerAdapter interface
// ---------------------------------------------------------------------------

/**
 * A NormalizerAdapter transforms raw vendor telemetry into one or more
 * canonical TraceReplay events.
 *
 * Each adapter targets a specific vendor/framework (e.g., OpenAI Agents SDK,
 * LangChain, custom). The normalizer service discovers and dispatches to the
 * correct adapter based on the `vendor` field in the raw event.
 *
 * Contract:
 * - A single raw vendor event may produce zero, one, or many canonical events.
 * - Adapters MUST NOT throw — errors are returned as `NormalizationError`.
 * - Adapters MUST preserve raw data as `rawMeta` on canonical events.
 * - Adapters MUST NOT fabricate data that wasn't in the raw event.
 */
export interface NormalizerAdapter {
  /** Unique identifier for this adapter (matches `RawVendorEvent.vendor`). */
  readonly vendorId: string;

  /** Human-readable name for logging and registration. */
  readonly displayName: string;

  /**
   * Returns true if this adapter can handle the given raw event.
   * Used for adapter discovery when `vendor` field is ambiguous or missing.
   */
  canHandle(raw: RawVendorEvent): boolean;

  /**
   * Transform a raw vendor event into canonical TraceReplay events.
   * Must not throw — return `NormalizationError` on failure.
   */
  normalize(raw: RawVendorEvent): NormalizationResult;
}

// ---------------------------------------------------------------------------
// Adapter registry
// ---------------------------------------------------------------------------

/**
 * Registry for NormalizerAdapters.
 * The normalizer service uses this to find the right adapter for each raw event.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, NormalizerAdapter>();

  /** Register an adapter for a vendor ID. Overwrites existing. */
  register(adapter: NormalizerAdapter): void {
    this.adapters.set(adapter.vendorId, adapter);
  }

  /** Look up an adapter by vendor ID. */
  get(vendorId: string): NormalizerAdapter | undefined {
    return this.adapters.get(vendorId);
  }

  /**
   * Find an adapter that can handle the raw event.
   * Tries exact vendor match first, then falls back to `canHandle()` probing.
   */
  resolve(raw: RawVendorEvent): NormalizerAdapter | undefined {
    // Exact match on vendor ID
    const exact = this.adapters.get(raw.vendor);
    if (exact) return exact;

    // Probe all adapters
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(raw)) return adapter;
    }

    return undefined;
  }

  /** List all registered vendor IDs. */
  vendorIds(): string[] {
    return [...this.adapters.keys()];
  }
}
