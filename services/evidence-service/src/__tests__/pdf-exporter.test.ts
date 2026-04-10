import { describe, it, expect, beforeEach } from 'vitest';
import type { TraceReplayEvent, EventId, RunId, TenantId, EventType } from '@tracereplay/event-schema';
import type { ReplayTimeline } from '@tracereplay/replay-engine';
import type { SerializedLineageGraph } from '@tracereplay/graph-model';

import type { EvidenceBundle, RedactionAudit } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';
import {
  EvidencePdfExporter,
  PdfExportError,
} from '../exporters/pdf-exporter.js';
import type { PdfSection } from '../exporters/pdf-exporter.js';

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
  overrides: Partial<TraceReplayEvent> = {},
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
    ...overrides,
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
    totalRedactedFields: 3,
    eventRedactions: [
      {
        eventId: `a0000001-0000-4000-8000-000000000002`,
        redactedFields: [
          { fieldPath: 'content', ruleId: 'pii-email', action: 'mask' },
          { fieldPath: 'metadata.apiKey', ruleId: 'secrets', action: 'remove' },
        ],
      },
      {
        eventId: `a0000001-0000-4000-8000-000000000003`,
        redactedFields: [
          { fieldPath: 'metadata.password', ruleId: 'secrets', action: 'hash' },
        ],
      },
    ],
  };
}

function makeCompleteBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const events = [
    makeEvent(1, 'run.start', { runName: 'test-run', triggerSource: 'user' }),
    makeEvent(2, 'prompt.input', { role: 'user', content: 'Hello world', tokenCount: 2 }),
    makeEvent(3, 'tool.call.start', { toolName: 'read_file', args: { path: '/tmp/test.ts' } }),
    makeEvent(4, 'tool.call.end', { toolName: 'read_file', result: 'file contents here' }),
    makeEvent(5, 'approval.requested', { approvalType: 'file_write' }),
    makeEvent(6, 'approval.granted', { decision: 'approved', reason: 'Looks safe' }),
    makeEvent(7, 'run.end', { status: 'success', durationMs: 6000 }),
  ];

  return {
    id: BUNDLE_ID as EvidenceBundle['id'],
    runId: RUN_ID,
    tenantId: TENANT_ID,
    status: 'complete',
    createdAt: '2026-03-15T10:00:00.000Z',
    completedAt: '2026-03-15T10:00:07.000Z',
    runMetadata: {
      runId: RUN_ID,
      tenantId: TENANT_ID,
      agentId: 'test-agent',
      runName: 'test-run',
      triggerSource: 'user',
      parentRunId: null,
      status: 'success',
      startedAt: '2026-03-15T10:00:00.000Z',
      endedAt: '2026-03-15T10:00:07.000Z',
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
// PDF magic bytes: %PDF- (hex: 25 50 44 46 2D)
// ---------------------------------------------------------------------------

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EvidencePdfExporter', () => {
  let exporter: EvidencePdfExporter;

  beforeEach(() => {
    exporter = new EvidencePdfExporter();
  });

  // -----------------------------------------------------------------------
  // export()
  // -----------------------------------------------------------------------
  describe('export()', () => {
    it('produces a valid PDF buffer from a complete bundle', async () => {
      const bundle = makeCompleteBundle();
      const pdf = await exporter.export(bundle);

      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('throws PdfExportError for non-complete bundles', async () => {
      const bundle = makeCompleteBundle({ status: 'pending' });
      await expect(exporter.export(bundle)).rejects.toThrow(PdfExportError);
    });

    it('throws PdfExportError with correct code for failed bundle', async () => {
      const bundle = makeCompleteBundle({ status: 'failed' });
      try {
        await exporter.export(bundle);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PdfExportError);
        expect((err as PdfExportError).code).toBe('BUNDLE_NOT_COMPLETE');
      }
    });

    it('throws PdfExportError for assembling bundle', async () => {
      const bundle = makeCompleteBundle({ status: 'assembling' });
      await expect(exporter.export(bundle)).rejects.toThrow(PdfExportError);
    });

    it('generates a valid PDF for a bundle with zero events', async () => {
      const bundle = makeCompleteBundle({
        events: [],
        timeline: null,
        lineageGraph: null,
      });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it('generates a valid PDF for a partial run', async () => {
      const bundle = makeCompleteBundle({
        isPartialRun: true,
        partialRunMarker: 'Run was still in progress at assembly time',
      });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('generates a valid PDF for a bundle with null runMetadata', async () => {
      const bundle = makeCompleteBundle({ runMetadata: null });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('generates a valid PDF for a bundle with redactions', async () => {
      const bundle = makeCompleteBundle({
        redactionAudit: makeRedactionAudit(true),
      });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it('generates a valid PDF for a bundle with error events', async () => {
      const events = [
        makeEvent(1, 'run.start', { runName: 'error-run' }),
        makeEvent(2, 'tool.call.error', {
          toolName: 'bad-tool',
          error: 'Command failed',
          errorType: 'ExecutionError',
        }),
        makeEvent(3, 'run.error', {
          error: 'Unrecoverable failure',
          stack: 'Error: ...\n  at ...',
        }),
      ];

      const bundle = makeCompleteBundle({ events });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('produces different outputs for summary vs full detail', async () => {
      const bundle = makeCompleteBundle();

      const summaryExporter = new EvidencePdfExporter({ detailLevel: 'summary' });
      const fullExporter = new EvidencePdfExporter({ detailLevel: 'full' });

      const summaryPdf = await summaryExporter.export(bundle);
      const fullPdf = await fullExporter.export(bundle);

      expect(isPdfBuffer(summaryPdf)).toBe(true);
      expect(isPdfBuffer(fullPdf)).toBe(true);
      // Full detail should generally be larger (more content)
      expect(fullPdf.length).toBeGreaterThanOrEqual(summaryPdf.length);
    });
  });

  // -----------------------------------------------------------------------
  // Section configuration
  // -----------------------------------------------------------------------
  describe('section configuration', () => {
    it('renders only the specified sections', async () => {
      const singleSectionExporter = new EvidencePdfExporter({
        sections: ['executiveSummary'],
      });
      const allSectionsExporter = new EvidencePdfExporter();

      const bundle = makeCompleteBundle();

      const singlePdf = await singleSectionExporter.export(bundle);
      const allPdf = await allSectionsExporter.export(bundle);

      expect(isPdfBuffer(singlePdf)).toBe(true);
      expect(isPdfBuffer(allPdf)).toBe(true);
      // Fewer sections → smaller PDF
      expect(singlePdf.length).toBeLessThan(allPdf.length);
    });

    it('renders with a subset of sections', async () => {
      const sections: PdfSection[] = ['runMetadata', 'errors'];
      const limitedExporter = new EvidencePdfExporter({ sections });
      const bundle = makeCompleteBundle();

      const pdf = await limitedExporter.export(bundle);
      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('renders with empty sections array (title + footer only)', async () => {
      const noSectionExporter = new EvidencePdfExporter({ sections: [] });
      const bundle = makeCompleteBundle();

      const pdf = await noSectionExporter.export(bundle);
      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('handles all individual sections independently', async () => {
      const allSections: PdfSection[] = [
        'executiveSummary',
        'runMetadata',
        'eventTimeline',
        'toolCalls',
        'keyDecisions',
        'errors',
        'redactionSummary',
      ];

      const bundle = makeCompleteBundle({
        redactionAudit: makeRedactionAudit(true),
      });

      for (const section of allSections) {
        const sectionExporter = new EvidencePdfExporter({ sections: [section] });
        const pdf = await sectionExporter.export(bundle);
        expect(isPdfBuffer(pdf)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Page size
  // -----------------------------------------------------------------------
  describe('page size', () => {
    it('generates PDF with A4 page size (default)', async () => {
      const a4Exporter = new EvidencePdfExporter({ pageSize: 'A4' });
      const bundle = makeCompleteBundle();
      const pdf = await a4Exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('generates PDF with LETTER page size', async () => {
      const letterExporter = new EvidencePdfExporter({ pageSize: 'LETTER' });
      const bundle = makeCompleteBundle();
      const pdf = await letterExporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // generateFilename()
  // -----------------------------------------------------------------------
  describe('generateFilename()', () => {
    it('produces a filename with .pdf extension', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidencePdfExporter.generateFilename(bundle);

      expect(filename).toMatch(/\.pdf$/);
    });

    it('includes the run ID in the filename', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidencePdfExporter.generateFilename(bundle);

      expect(filename).toContain(RUN_ID);
    });

    it('starts with "evidence-" prefix', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidencePdfExporter.generateFilename(bundle);

      expect(filename).toMatch(/^evidence-/);
    });

    it('includes timestamp-derived date part', () => {
      const bundle = makeCompleteBundle();
      const filename = EvidencePdfExporter.generateFilename(bundle);

      // Should contain date elements from the bundle createdAt
      expect(filename).toContain('2026-03-15');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases: large bundle
  // -----------------------------------------------------------------------
  describe('large bundles', () => {
    it('handles a bundle with many events without crashing', async () => {
      const events: TraceReplayEvent[] = [];
      for (let i = 1; i <= 50; i++) {
        const seq = i.toString().padStart(2, '0');
        events.push(
          makeEvent(i, 'tool.call.start', { toolName: `tool-${i}` }, {
            id: `a0000001-0000-4000-8000-0000000000${seq}` as EventId,
            timestamp: `2026-03-15T10:${seq}:00.000Z`,
          }),
        );
      }

      const bundle = makeCompleteBundle({ events });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
      // Multi-page PDF should be reasonably large
      expect(pdf.length).toBeGreaterThan(1000);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases: missing/empty data
  // -----------------------------------------------------------------------
  describe('missing data handling', () => {
    it('handles null lineageGraph gracefully', async () => {
      const bundle = makeCompleteBundle({ lineageGraph: null });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('handles null timeline gracefully', async () => {
      const bundle = makeCompleteBundle({ timeline: null });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('handles empty redaction audit', async () => {
      const bundle = makeCompleteBundle({
        redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
      });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });

    it('handles events with minimal payloads', async () => {
      const events = [
        makeEvent(1, 'run.start', {}),
        makeEvent(2, 'custom' as EventType, {}),
        makeEvent(3, 'run.end', {}),
      ];
      const bundle = makeCompleteBundle({ events });
      const pdf = await exporter.export(bundle);

      expect(isPdfBuffer(pdf)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PdfExportError
  // -----------------------------------------------------------------------
  describe('PdfExportError', () => {
    it('has correct name property', () => {
      const err = new PdfExportError('test', 'TEST_CODE');
      expect(err.name).toBe('PdfExportError');
    });

    it('has correct code property', () => {
      const err = new PdfExportError('test message', 'CUSTOM_CODE');
      expect(err.code).toBe('CUSTOM_CODE');
    });

    it('has correct message', () => {
      const err = new PdfExportError('Something went wrong', 'ERR');
      expect(err.message).toBe('Something went wrong');
    });

    it('is an instance of Error', () => {
      const err = new PdfExportError('test', 'TEST');
      expect(err).toBeInstanceOf(Error);
    });
  });
});
