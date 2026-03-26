import { createHash } from 'node:crypto';

import type { EvidenceBundle } from '../types.js';
import type { EvidenceJsonExport, ExportBundleMetadata } from '../export-types.js';
import {
  EXPORT_SCHEMA_VERSION,
  evidenceJsonExportSchema,
} from '../export-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 integrity hash of the bundle content.
 *
 * The hash covers every field of the export *except* `integrityHash` itself,
 * serialized as deterministic JSON (keys sorted recursively, no extra whitespace).
 */
function computeIntegrityHash(exportData: Omit<EvidenceJsonExport, 'integrityHash'>): string {
  const canonical = deterministicStringify(exportData);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Produce a deterministic JSON string with keys sorted recursively at every
 * level. This ensures the same logical object always produces the same string
 * regardless of property insertion order.
 */
function deterministicStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Extract bundle-level metadata from the full evidence bundle.
 */
function extractBundleMetadata(bundle: EvidenceBundle): ExportBundleMetadata {
  return {
    bundleId: bundle.id,
    status: bundle.status,
    createdAt: bundle.createdAt,
    completedAt: bundle.completedAt,
    isPartialRun: bundle.isPartialRun,
    partialRunMarker: bundle.partialRunMarker,
    bundleSchemaVersion: bundle.bundleSchemaVersion,
  };
}

// ---------------------------------------------------------------------------
// EvidenceJsonExporter
// ---------------------------------------------------------------------------

/** Options for JSON export generation. */
export interface JsonExportOptions {
  /**
   * Whether to pretty-print the output JSON.
   * Default: `true` (2-space indentation).
   */
  pretty?: boolean;
}

/**
 * Serializes an {@link EvidenceBundle} to a self-describing, schema-versioned
 * JSON document suitable for archival, transfer, and re-import.
 *
 * The exported JSON includes:
 * - A `formatId` identifying the document type
 * - A `schemaVersion` for forward/backward compatibility
 * - A SHA-256 `integrityHash` covering all bundle content
 * - Full event list, timeline, lineage graph, and redaction audit
 *
 * The export can be validated against the Zod schema defined in
 * `export-types.ts` via the {@link validate} static method.
 */
export class EvidenceJsonExporter {
  private readonly options: Required<JsonExportOptions>;

  constructor(options: JsonExportOptions = {}) {
    this.options = {
      pretty: options.pretty ?? true,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Export an evidence bundle to a self-describing JSON string.
   *
   * @param bundle - The assembled evidence bundle.
   * @returns A JSON string containing the full export document.
   * @throws {ExportError} if the bundle is not in `complete` status or
   *         if the resulting document fails schema validation.
   */
  export(bundle: EvidenceBundle): string {
    if (bundle.status !== 'complete') {
      throw new ExportError(
        `Cannot export bundle ${bundle.id}: status is "${bundle.status}" (expected "complete")`,
        'BUNDLE_NOT_COMPLETE',
      );
    }

    const exportData = this.buildExportDocument(bundle);
    const json = this.serialize(exportData);

    return json;
  }

  /**
   * Export an evidence bundle and return the structured document object
   * (before serialization to a string). Useful when callers want the
   * typed object rather than raw JSON.
   */
  exportAsObject(bundle: EvidenceBundle): EvidenceJsonExport {
    if (bundle.status !== 'complete') {
      throw new ExportError(
        `Cannot export bundle ${bundle.id}: status is "${bundle.status}" (expected "complete")`,
        'BUNDLE_NOT_COMPLETE',
      );
    }

    return this.buildExportDocument(bundle);
  }

  /**
   * Validate an unknown JSON-parsed value against the export schema.
   *
   * @returns `{ valid: true, data }` if valid, `{ valid: false, errors }` otherwise.
   */
  static validate(input: unknown): ExportValidationResult {
    const result = evidenceJsonExportSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return {
      valid: false,
      errors: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  /**
   * Verify the integrity hash of a previously exported document.
   *
   * Re-computes the hash from the document content and compares it
   * to the stored `integrityHash`.
   *
   * @returns `true` if the hash matches, `false` if it has been tampered with.
   */
  static verifyIntegrity(exportDoc: EvidenceJsonExport): boolean {
    const { integrityHash: _stored, ...contentWithoutHash } = exportDoc;
    const recomputed = computeIntegrityHash(contentWithoutHash);
    return recomputed === _stored;
  }

  /**
   * Generate a human-readable filename for the export.
   */
  static generateFilename(bundle: EvidenceBundle): string {
    const datePart = bundle.createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
    return `evidence-${bundle.runId}-${datePart}.json`;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build the full export document from the bundle, including the
   * computed integrity hash.
   */
  private buildExportDocument(bundle: EvidenceBundle): EvidenceJsonExport {
    const now = new Date().toISOString();

    // Build the body without the integrity hash first
    const body: Omit<EvidenceJsonExport, 'integrityHash'> = {
      formatId: 'tracereplay-evidence-export',
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now,
      bundle: extractBundleMetadata(bundle),
      run: bundle.runMetadata,
      events: bundle.events,
      timeline: bundle.timeline,
      lineage: bundle.lineageGraph,
      redactionAudit: bundle.redactionAudit,
    };

    const integrityHash = computeIntegrityHash(body);

    return { ...body, integrityHash };
  }

  /**
   * Serialize the export document to a JSON string.
   */
  private serialize(doc: EvidenceJsonExport): string {
    if (this.options.pretty) {
      return JSON.stringify(doc, null, 2);
    }
    return JSON.stringify(doc);
  }
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

export type ExportValidationResult =
  | { valid: true; data: EvidenceJsonExport }
  | { valid: false; errors: Array<{ path: string; message: string }> };

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Domain error for evidence export failures. */
export class ExportError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
  }
}
