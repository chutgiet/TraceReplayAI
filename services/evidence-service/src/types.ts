import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { ReplayTimeline } from '@tracereplay/replay-engine';
import type { RedactionRecord } from '@tracereplay/redaction';
import type { SerializedLineageGraph } from '@tracereplay/graph-model';

// ---------------------------------------------------------------------------
// Bundle IDs
// ---------------------------------------------------------------------------

/** Branded string type for evidence bundle identifiers. */
export type BundleId = string & { readonly __brand: 'BundleId' };

// ---------------------------------------------------------------------------
// Bundle status lifecycle
// ---------------------------------------------------------------------------

/** Status of an evidence bundle during its lifecycle. */
export type BundleStatus = 'pending' | 'assembling' | 'complete' | 'failed';

// ---------------------------------------------------------------------------
// Run metadata snapshot
// ---------------------------------------------------------------------------

/** Snapshot of run metadata at bundle assembly time. */
export interface RunMetadataSnapshot {
  runId: string;
  tenantId: string;
  agentId: string;
  runName: string | null;
  triggerSource: string | null;
  parentRunId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  tags: string[];
  metadata: Record<string, unknown> | null;
  schemaVersion: string;
}

// ---------------------------------------------------------------------------
// Redaction audit
// ---------------------------------------------------------------------------

/** Aggregated redaction audit trail for the bundle. */
export interface RedactionAudit {
  /** Total number of fields redacted across all events. */
  totalRedactedFields: number;
  /** Per-event redaction records. */
  eventRedactions: EventRedactionEntry[];
}

/** Redaction records for a single event. */
export interface EventRedactionEntry {
  eventId: string;
  redactedFields: RedactionRecord[];
}

// ---------------------------------------------------------------------------
// Evidence bundle
// ---------------------------------------------------------------------------

/** A complete evidence bundle for audit review. */
export interface EvidenceBundle {
  /** Unique bundle identifier. */
  id: BundleId;
  /** The run this bundle was assembled from. */
  runId: string;
  /** Tenant that owns this bundle. */
  tenantId: string;
  /** Current status of the bundle. */
  status: BundleStatus;
  /** ISO 8601 timestamp of when assembly was initiated. */
  createdAt: string;
  /** ISO 8601 timestamp of when assembly completed (null if pending/failed). */
  completedAt: string | null;
  /** Run metadata snapshot at assembly time. */
  runMetadata: RunMetadataSnapshot | null;
  /** All events in chronological order. */
  events: TraceReplayEvent[];
  /** Replay timeline with causal depth and gap detection. */
  timeline: ReplayTimeline | null;
  /** Lineage graph in serialized (JSON-safe) format. */
  lineageGraph: SerializedLineageGraph | null;
  /** Aggregated redaction audit trail. */
  redactionAudit: RedactionAudit;
  /** Whether the run was still in progress at assembly time. */
  isPartialRun: boolean;
  /** Human-readable note if the run was partial. */
  partialRunMarker: string | null;
  /** Error message if assembly failed. */
  errorMessage: string | null;
  /** Schema version of this bundle format. */
  bundleSchemaVersion: string;
}

// ---------------------------------------------------------------------------
// Bundle storage row (DB representation)
// ---------------------------------------------------------------------------

/**
 * Row representation for the evidence_bundles table.
 * The full bundle data is stored as JSONB; this row tracks status and keys.
 */
export interface BundleRow {
  id: string;
  run_id: string;
  tenant_id: string;
  status: BundleStatus;
  created_at: Date;
  completed_at: Date | null;
  is_partial_run: boolean;
  error_message: string | null;
  bundle_data: EvidenceBundle | null;
  bundle_schema_version: string;
}

/** Subset for INSERT — omits DB-defaulted columns. */
export interface InsertBundleRow {
  id: string;
  run_id: string;
  tenant_id: string;
  status: BundleStatus;
  is_partial_run?: boolean;
  error_message?: string | null;
  bundle_data?: EvidenceBundle | null;
  bundle_schema_version: string;
}

// ---------------------------------------------------------------------------
// Assembly request / result types
// ---------------------------------------------------------------------------

/** Input for requesting a new evidence bundle. */
export interface AssembleBundleRequest {
  runId: string;
  tenantId: string;
}

/** Result of the assembly operation. */
export interface AssembleBundleResult {
  bundle: EvidenceBundle;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current version of the bundle schema format. */
export const BUNDLE_SCHEMA_VERSION = '1.0.0';
