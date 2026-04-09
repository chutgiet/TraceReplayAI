import { describe, it, expect, beforeEach } from 'vitest';
import type { TraceReplayEvent, EventId, RunId, TenantId, EventType } from '@tracereplay/event-schema';
import type { ReplayTimeline } from '@tracereplay/replay-engine';
import type { SerializedLineageGraph } from '@tracereplay/graph-model';

import type { EvidenceBundle, RedactionAudit } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';
import {
  EvidenceJsonExporter,
  ExportError,
} from '../exporters/json-exporter.js';
import {
  EXPORT_SCHEMA_VERSION,
} from '../export-types.js';
import type { EvidenceJsonExport } from '../export-types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BUNDLE_ID = 'd0000001-0000-4000-8000-000000000001';
const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeEvent(
  index: number,
  type: EventType,
  payload: Record<string, unknown>,
): TraceReplayEvent {
  return {
    id: `a0000001-0000-4000-8000-00000000000${index}` as EventId,
    runId: RUN_ID as RunId,
    type,
    timestamp: `2026-03-15T10:00:0${index}.000Z`,
    sequence: index,
    tenantId: TENANT_ID as TenantId,
    sourceAgent: 'test-agent',
    sourceFramework: 'custom',
    payload,
    tags: ['test'],
    schemaVersion: '1.0.0',
  } as TraceReplayEvent;
}

function makeTimeline(events: TraceReplayEvent[]): ReplayTimeline {
  return {
    entries: events.map((e, i) => ({
      event: e,
      index: i,
      depth: 0,
      childEventIds: [],
      durationMs: i === 0 ? undefined : 1000,
    })),
    gaps: [],
    summary: {
      runId: RUN_ID as unknown as import('@tracereplay/event-schema').RunId,
      tenantId: TENANT_ID as unknown as import('@tracereplay/event-schema').TenantId,
      eventCount: events.length,
      eventTypeCounts: { 'run.start': 1, 'prompt.input': 1, 'run.end': 1 },
      durationMs: 5000,
      hasGaps: false,
      toolCount: 0,
      hasErrors: false,
    },
  };
}

function makeLineageGraph(): SerializedLineageGraph {
  return {
    nodes: [
      {
        id: 'node-1',
        type: 'event',
        runId: RUN_ID,
        tenantId: TENANT_ID,
        meta: {
          eventType: 'run.start',
          sourceAgent: 'test-agent',
          timestamp: '2026-03-15T10:00:01.000Z',
        },
        sourceEventId: `a0000001-0000-4000-8000-000000000001`,
      },
    ],
    edges: [],
    summary: {
      nodeCount: 1,
      edgeCount: 0,
      nodeTypeCounts: { run: 0, event: 1, side_effect: 0, external_system: 0 },
      edgeTypeCounts: { causal: 0, temporal: 0, produces: 0, delegation: 0, data_flow: 0 },
      runCount: 0,
      externalSystemCount: 0,
      sideEffectCount: 0,
      maxCausalDepth: 0,
      hasDelegation: false,
    },
  } as unknown as SerializedLineageGraph;
}

function makeRedactionAudit(hasRedactions = false): RedactionAudit {
  if (!hasRedactions) {
    return { totalRedactedFields: 0, eventRedactions: [] };
  }
  return {
    totalRedactedFields: 2,
    eventRedactions: [
      {
        eventId: `a0000001-0000-4000-8000-000000000002`,
        redactedFields: [
          { fieldPath: 'content', ruleId: 'pii-email', action: 'mask' },
          { fieldPath: 'metadata.apiKey', ruleId: 'secrets', action: 'remove' },
        ],
      },
    ],
  };
}

function makeCompleteBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const events = [
    makeEvent(1, 'run.start', { runName: 'test-run', triggerSource: 'user' }),
    makeEvent(2, 'prompt.input', { role: 'user', content: 'Hello', tokenCount: 1 }),
    makeEvent(3, 'run.end', { status: 'success', durationMs: 5000 }),
  ];

  return {
    id: BUNDLE_ID as EvidenceBundle['id'],
    runId: RUN_ID,
    tenantId: TENANT_ID,
    status: 'complete',
    createdAt: '2026-03-15T10:00:00.000Z',
    completedAt: '2026-03-15T10:00:01.000Z',
    runMetadata: {
      runId: RUN_ID,
      tenantId: TENANT_ID,
      agentId: 'test-agent',
      runName: 'test-run',
      triggerSource: 'user',
      parentRunId: null,
      status: 'success',
      startedAt: '2026-03-15T10:00:00.000Z',
      endedAt: '2026-03-15T10:00:05.000Z',
      tags: ['test'],
      metadata: null,
      schemaVersion: '1.0.0',
    },
    events,
    timeline: makeTimeline(events),
    lineageGraph: makeLineageGraph(),
    redactionAudit: makeRedactionAudit(),
    isPartialRun: false,
    partialRunMarker: null,
    errorMessage: null,
    integrityChain: null,
    rootIntegrityHash: null,
    bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EvidenceJsonExporter', () => {
  let exporter: EvidenceJsonExporter;

  beforeEach(() => {
    exporter = new EvidenceJsonExporter();
  });

  // -----------------------------------------------------------------------
  // export()
  // -----------------------------------------------------------------------
  describe('export()', () => {
    it('produces valid JSON string from a complete bundle', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.formatId).toBe('tracereplay-evidence-export');
      expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    });

    it('includes all required top-level fields', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('formatId');
      expect(parsed).toHaveProperty('schemaVersion');
      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('bundle');
      expect(parsed).toHaveProperty('run');
      expect(parsed).toHaveProperty('events');
      expect(parsed).toHaveProperty('timeline');
      expect(parsed).toHaveProperty('lineage');
      expect(parsed).toHaveProperty('redactionAudit');
      expect(parsed).toHaveProperty('integrityHash');
    });

    it('sets exportedAt to a valid ISO 8601 timestamp', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      // Should be a valid date
      const date = new Date(parsed.exportedAt);
      expect(date.getTime()).not.toBeNaN();
    });

    it('maps bundle metadata correctly', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.bundle.bundleId).toBe(BUNDLE_ID);
      expect(parsed.bundle.status).toBe('complete');
      expect(parsed.bundle.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(parsed.bundle.completedAt).toBe('2026-03-15T10:00:01.000Z');
      expect(parsed.bundle.isPartialRun).toBe(false);
      expect(parsed.bundle.partialRunMarker).toBeNull();
      expect(parsed.bundle.bundleSchemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    });

    it('includes run metadata', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.run.runId).toBe(RUN_ID);
      expect(parsed.run.tenantId).toBe(TENANT_ID);
      expect(parsed.run.agentId).toBe('test-agent');
      expect(parsed.run.status).toBe('success');
    });

    it('includes all events in order', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.events).toHaveLength(3);
      expect(parsed.events[0].type).toBe('run.start');
      expect(parsed.events[1].type).toBe('prompt.input');
      expect(parsed.events[2].type).toBe('run.end');
    });

    it('includes timeline data', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.timeline).not.toBeNull();
      expect(parsed.timeline.entries).toHaveLength(3);
      expect(parsed.timeline.summary.totalEvents).toBe(3);
    });

    it('includes lineage graph', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.lineage).not.toBeNull();
      expect(parsed.lineage.nodes).toHaveLength(1);
    });

    it('includes redaction audit', () => {
      const bundle = makeCompleteBundle({
        redactionAudit: makeRedactionAudit(true),
      });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.redactionAudit.totalRedactedFields).toBe(2);
      expect(parsed.redactionAudit.eventRedactions).toHaveLength(1);
      expect(parsed.redactionAudit.eventRedactions[0].redactedFields).toHaveLength(2);
    });

    it('computes an integrity hash', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(typeof parsed.integrityHash).toBe('string');
      expect(parsed.integrityHash).toHaveLength(64); // SHA-256 hex
    });

    it('throws ExportError for non-complete bundles', () => {
      const pendingBundle = makeCompleteBundle({ status: 'pending' });
      expect(() => exporter.export(pendingBundle)).toThrow(ExportError);
      expect(() => exporter.export(pendingBundle)).toThrow(/status is "pending"/);
    });

    it('throws ExportError for failed bundles', () => {
      const failedBundle = makeCompleteBundle({ status: 'failed' });
      expect(() => exporter.export(failedBundle)).toThrow(ExportError);
    });

    it('throws ExportError for assembling bundles', () => {
      const assemblingBundle = makeCompleteBundle({ status: 'assembling' });
      expect(() => exporter.export(assemblingBundle)).toThrow(ExportError);
    });

    it('handles bundles with null timeline', () => {
      const bundle = makeCompleteBundle({ timeline: null });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.timeline).toBeNull();
    });

    it('handles bundles with null lineage graph', () => {
      const bundle = makeCompleteBundle({ lineageGraph: null });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.lineage).toBeNull();
    });

    it('handles bundles with null run metadata', () => {
      const bundle = makeCompleteBundle({ runMetadata: null });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.run).toBeNull();
    });

    it('handles empty event list', () => {
      const bundle = makeCompleteBundle({ events: [], timeline: null });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.events).toHaveLength(0);
    });

    it('handles partial run bundles', () => {
      const bundle = makeCompleteBundle({
        isPartialRun: true,
        partialRunMarker: 'Run was in progress at assembly time',
      });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      expect(parsed.bundle.isPartialRun).toBe(true);
      expect(parsed.bundle.partialRunMarker).toBe('Run was in progress at assembly time');
    });
  });

  // -----------------------------------------------------------------------
  // exportAsObject()
  // -----------------------------------------------------------------------
  describe('exportAsObject()', () => {
    it('returns a typed EvidenceJsonExport object', () => {
      const bundle = makeCompleteBundle();
      const result = exporter.exportAsObject(bundle);

      expect(result.formatId).toBe('tracereplay-evidence-export');
      expect(result.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(typeof result.integrityHash).toBe('string');
    });

    it('throws ExportError for non-complete bundles', () => {
      const pendingBundle = makeCompleteBundle({ status: 'pending' });
      expect(() => exporter.exportAsObject(pendingBundle)).toThrow(ExportError);
    });
  });

  // -----------------------------------------------------------------------
  // Pretty-print options
  // -----------------------------------------------------------------------
  describe('options: pretty', () => {
    it('produces pretty-printed JSON by default', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);

      // Pretty-printed JSON contains newlines
      expect(json).toContain('\n');
    });

    it('produces compact JSON when pretty is false', () => {
      const compactExporter = new EvidenceJsonExporter({ pretty: false });
      const bundle = makeCompleteBundle();
      const json = compactExporter.export(bundle);

      // Compact JSON has no newlines
      expect(json).not.toContain('\n');
    });
  });

  // -----------------------------------------------------------------------
  // validate()
  // -----------------------------------------------------------------------
  describe('validate()', () => {
    it('validates a correctly exported document', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);
      const result = EvidenceJsonExporter.validate(doc);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.formatId).toBe('tracereplay-evidence-export');
      }
    });

    it('rejects a document missing required fields', () => {
      const result = EvidenceJsonExporter.validate({ foo: 'bar' });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('rejects a document with wrong formatId', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);
      const tampered = { ...doc, formatId: 'wrong-id' };
      const result = EvidenceJsonExporter.validate(tampered);

      expect(result.valid).toBe(false);
    });

    it('rejects a document with wrong schemaVersion', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);
      const tampered = { ...doc, schemaVersion: '99.0.0' };
      const result = EvidenceJsonExporter.validate(tampered);

      expect(result.valid).toBe(false);
    });

    it('rejects null input', () => {
      const result = EvidenceJsonExporter.validate(null);
      expect(result.valid).toBe(false);
    });

    it('rejects undefined input', () => {
      const result = EvidenceJsonExporter.validate(undefined);
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // verifyIntegrity()
  // -----------------------------------------------------------------------
  describe('verifyIntegrity()', () => {
    it('returns true for an untampered export', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      expect(EvidenceJsonExporter.verifyIntegrity(doc)).toBe(true);
    });

    it('returns false when an event is modified', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      // Tamper with an event
      const tampered: EvidenceJsonExport = {
        ...doc,
        events: doc.events.map((e, i) =>
          i === 0
            ? { ...e, payload: { ...e.payload, tampered: true } }
            : e,
        ),
      };

      expect(EvidenceJsonExporter.verifyIntegrity(tampered)).toBe(false);
    });

    it('returns false when run metadata is modified', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      const tampered: EvidenceJsonExport = {
        ...doc,
        run: doc.run ? { ...doc.run, status: 'failure' } : null,
      };

      expect(EvidenceJsonExporter.verifyIntegrity(tampered)).toBe(false);
    });

    it('returns false when exportedAt is modified', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      const tampered: EvidenceJsonExport = {
        ...doc,
        exportedAt: '2099-01-01T00:00:00.000Z',
      };

      expect(EvidenceJsonExporter.verifyIntegrity(tampered)).toBe(false);
    });

    it('returns false when bundle metadata is modified', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      const tampered: EvidenceJsonExport = {
        ...doc,
        bundle: { ...doc.bundle, status: 'failed' },
      };

      expect(EvidenceJsonExporter.verifyIntegrity(tampered)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // generateFilename()
  // -----------------------------------------------------------------------
  describe('generateFilename()', () => {
    it('generates a filename with run ID and timestamp', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidenceJsonExporter.generateFilename(bundle);

      expect(filename).toContain('evidence-');
      expect(filename).toContain(RUN_ID);
      expect(filename.endsWith('.json')).toBe(true);
    });

    it('replaces colons and dots in timestamp', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidenceJsonExporter.generateFilename(bundle);

      // Should not contain colons or dots (except .json extension)
      const withoutExt = filename.replace('.json', '');
      expect(withoutExt).not.toContain(':');
      expect(withoutExt).not.toContain('.');
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip: export → parse → validate → verify
  // -----------------------------------------------------------------------
  describe('round-trip', () => {
    it('export → parse → validate → verify succeeds', () => {
      const bundle = makeCompleteBundle();
      const json = exporter.export(bundle);

      // Parse
      const parsed = JSON.parse(json);

      // Validate against schema
      const validation = EvidenceJsonExporter.validate(parsed);
      expect(validation.valid).toBe(true);

      // Verify integrity
      if (validation.valid) {
        expect(EvidenceJsonExporter.verifyIntegrity(validation.data)).toBe(true);
      }
    });

    it('export → compact serialize → parse → validate succeeds', () => {
      const compactExporter = new EvidenceJsonExporter({ pretty: false });
      const bundle = makeCompleteBundle();
      const json = compactExporter.export(bundle);

      const parsed = JSON.parse(json);
      const validation = EvidenceJsonExporter.validate(parsed);
      expect(validation.valid).toBe(true);
    });

    it('export → re-serialize → integrity still valid', () => {
      const bundle = makeCompleteBundle();
      const doc = exporter.exportAsObject(bundle);

      // Re-serialize and re-parse (simulates file save/load)
      const json = JSON.stringify(doc);
      const reparsed = JSON.parse(json) as EvidenceJsonExport;

      expect(EvidenceJsonExporter.verifyIntegrity(reparsed)).toBe(true);
    });

    it('round-trip with redaction audit data', () => {
      const bundle = makeCompleteBundle({
        redactionAudit: makeRedactionAudit(true),
      });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      const validation = EvidenceJsonExporter.validate(parsed);
      expect(validation.valid).toBe(true);

      if (validation.valid) {
        expect(validation.data.redactionAudit.totalRedactedFields).toBe(2);
        expect(EvidenceJsonExporter.verifyIntegrity(validation.data)).toBe(true);
      }
    });

    it('round-trip with partial run', () => {
      const bundle = makeCompleteBundle({
        isPartialRun: true,
        partialRunMarker: 'Run in progress',
      });
      const json = exporter.export(bundle);
      const parsed = JSON.parse(json);

      const validation = EvidenceJsonExporter.validate(parsed);
      expect(validation.valid).toBe(true);

      if (validation.valid) {
        expect(validation.data.bundle.isPartialRun).toBe(true);
        expect(EvidenceJsonExporter.verifyIntegrity(validation.data)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // ExportError
  // -----------------------------------------------------------------------
  describe('ExportError', () => {
    it('has the correct name and code', () => {
      const err = new ExportError('test message', 'TEST_CODE');
      expect(err.name).toBe('ExportError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
