import { z } from 'zod';
import { baseEventSchema } from '@tracereplay/event-schema';
import { serializedLineageGraphSchema } from '@tracereplay/graph-model';

// ---------------------------------------------------------------------------
// Export format constants
// ---------------------------------------------------------------------------

/** Current version of the JSON export schema. */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

/** MIME type for tracereplay evidence JSON exports. */
export const JSON_EXPORT_MIME_TYPE = 'application/json';

// ---------------------------------------------------------------------------
// Run metadata snapshot (within export)
// ---------------------------------------------------------------------------

export const exportRunMetadataSchema = z.object({
  runId: z.string(),
  tenantId: z.string(),
  agentId: z.string(),
  runName: z.string().nullable(),
  triggerSource: z.string().nullable(),
  parentRunId: z.string().nullable(),
  status: z.string(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.unknown()).nullable(),
  schemaVersion: z.string(),
});

// ---------------------------------------------------------------------------
// Redaction audit (within export)
// ---------------------------------------------------------------------------

export const exportRedactionRecordSchema = z.object({
  fieldPath: z.string(),
  ruleId: z.string(),
  action: z.enum(['mask', 'remove', 'hash', 'tokenize']),
});

export const exportEventRedactionEntrySchema = z.object({
  eventId: z.string(),
  redactedFields: z.array(exportRedactionRecordSchema),
});

export const exportRedactionAuditSchema = z.object({
  totalRedactedFields: z.number().int().nonnegative(),
  eventRedactions: z.array(exportEventRedactionEntrySchema),
});

// ---------------------------------------------------------------------------
// Timeline entry / gap / summary (within export)
// ---------------------------------------------------------------------------

export const exportTimelineEntrySchema = z.object({
  event: baseEventSchema,
  depth: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().nullable(),
  isGapBoundary: z.boolean(),
}).passthrough();

export const exportTimelineGapSchema = z.object({
  beforeEventId: z.string().nullable(),
  afterEventId: z.string().nullable(),
  gapMs: z.number().nonnegative(),
  expectedSequence: z.number().int().nonnegative().optional(),
  actualSequence: z.number().int().nonnegative().optional(),
  type: z.string(),
}).passthrough();

export const exportRunSummarySchema = z.object({
  totalEvents: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative().nullable(),
  eventTypeCounts: z.record(z.number().int().nonnegative()),
  maxDepth: z.number().int().nonnegative(),
  gapCount: z.number().int().nonnegative(),
  hasErrors: z.boolean(),
}).passthrough();

export const exportTimelineSchema = z.object({
  entries: z.array(exportTimelineEntrySchema),
  gaps: z.array(exportTimelineGapSchema),
  summary: exportRunSummarySchema,
}).nullable();

// ---------------------------------------------------------------------------
// Bundle metadata (within export)
// ---------------------------------------------------------------------------

export const exportBundleMetadataSchema = z.object({
  bundleId: z.string().uuid(),
  status: z.enum(['pending', 'assembling', 'complete', 'failed']),
  createdAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  isPartialRun: z.boolean(),
  partialRunMarker: z.string().nullable(),
  bundleSchemaVersion: z.string(),
});

// ---------------------------------------------------------------------------
// Top-level JSON export schema
// ---------------------------------------------------------------------------

/**
 * The self-describing JSON export format for evidence bundles.
 *
 * This schema is used both to produce and to validate exported JSON files.
 * The `integrityHash` field serves as a tamper-evidence seal — it is the
 * SHA-256 hash of the canonical JSON representation of the bundle data
 * (everything except `integrityHash` itself).
 */
export const evidenceJsonExportSchema = z.object({
  /** Identifies this document as a TraceReplay evidence export. */
  formatId: z.literal('tracereplay-evidence-export'),

  /** Version of the export schema. */
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),

  /** ISO 8601 timestamp of when this export was generated. */
  exportedAt: z.string().datetime({ offset: true }),

  /** Bundle-level metadata. */
  bundle: exportBundleMetadataSchema,

  /** Run metadata snapshot at bundle assembly time. */
  run: exportRunMetadataSchema.nullable(),

  /** All events in chronological order. */
  events: z.array(baseEventSchema),

  /** Replay timeline with causal depth and gap detection. */
  timeline: exportTimelineSchema,

  /** Lineage graph in serialized form. */
  lineage: serializedLineageGraphSchema.nullable(),

  /** Aggregated redaction audit trail. */
  redactionAudit: exportRedactionAuditSchema,

  /** SHA-256 integrity hash of the bundle content (for tamper evidence). */
  integrityHash: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EvidenceJsonExport = z.infer<typeof evidenceJsonExportSchema>;
export type ExportBundleMetadata = z.infer<typeof exportBundleMetadataSchema>;
