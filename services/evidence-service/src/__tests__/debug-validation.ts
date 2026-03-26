import { EvidenceJsonExporter } from '../exporters/json-exporter.js';
import type { EventType } from '@tracereplay/event-schema';

const exporter = new EvidenceJsonExporter();

const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeEvent(index: number, type: EventType, payload: Record<string, unknown>) {
  return {
    id: `a0000001-0000-4000-8000-00000000000${index}`,
    runId: RUN_ID,
    type,
    timestamp: `2026-03-15T10:00:0${index}.000Z`,
    sequence: index,
    tenantId: TENANT_ID,
    sourceAgent: 'test-agent',
    sourceFramework: 'custom',
    payload,
    tags: ['test'],
    schemaVersion: '1.0.0',
  };
}

const events = [
  makeEvent(1, 'run.start', { runName: 'test-run', triggerSource: 'user' }),
  makeEvent(2, 'prompt.input', { role: 'user', content: 'Hello', tokenCount: 1 }),
  makeEvent(3, 'run.end', { status: 'success', durationMs: 5000 }),
];

const timeline = {
  entries: events.map((e, i) => ({
    event: e,
    depth: 0,
    durationMs: i === 0 ? null : 1000,
    isGapBoundary: false,
  })),
  gaps: [],
  summary: {
    totalEvents: events.length,
    totalDurationMs: 5000,
    eventTypeCounts: { 'run.start': 1, 'prompt.input': 1, 'run.end': 1 },
    maxDepth: 0,
    gapCount: 0,
    hasErrors: false,
  },
};

const bundle = {
  id: 'd0000001-0000-4000-8000-000000000001',
  runId: 'b0000001-0000-4000-8000-000000000001',
  tenantId: 'tenant-test-001',
  status: 'complete' as const,
  createdAt: '2026-03-15T10:00:00.000Z',
  completedAt: '2026-03-15T10:00:01.000Z',
  runMetadata: {
    runId: 'b0000001-0000-4000-8000-000000000001',
    tenantId: 'tenant-test-001',
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
  events: events as any,
  timeline: timeline,
  lineageGraph: null,
  redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
  isPartialRun: false,
  partialRunMarker: null,
  errorMessage: null,
  bundleSchemaVersion: '1.0.0',
} as any;

const doc = exporter.exportAsObject(bundle);
const result = EvidenceJsonExporter.validate(doc);

if (!result.valid) {
  console.log('VALIDATION ERRORS:');
  console.log(JSON.stringify(result.errors, null, 2));
} else {
  console.log('VALID');
}
