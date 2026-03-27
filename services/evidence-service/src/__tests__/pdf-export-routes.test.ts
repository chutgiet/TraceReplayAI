import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportRoutes } from '../routes/export.js';
import type { BundleRow, EvidenceBundle } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tracereplay/common', () => ({
  getPool: vi.fn(() => ({})),
  closePool: vi.fn(),
}));

const mockGetBundleById = vi.fn();
vi.mock('../repository.js', () => ({
  getBundleById: (...args: unknown[]) => mockGetBundleById(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const BUNDLE_ID = 'd0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeCompleteBundleData(): EvidenceBundle {
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
    events: [
      {
        id: 'a0000001-0000-4000-8000-000000000001',
        runId: RUN_ID,
        type: 'run.start',
        timestamp: '2026-03-15T10:00:01.000Z',
        sequence: 1,
        tenantId: TENANT_ID,
        sourceAgent: 'test-agent',
        payload: { runName: 'test-run', triggerSource: 'user' },
        tags: ['test'],
        schemaVersion: '1.0.0',
      },
      {
        id: 'a0000001-0000-4000-8000-000000000002',
        runId: RUN_ID,
        type: 'tool.call.start',
        timestamp: '2026-03-15T10:00:02.000Z',
        sequence: 2,
        tenantId: TENANT_ID,
        sourceAgent: 'test-agent',
        payload: { toolName: 'read_file', args: { path: '/tmp/test.ts' } },
        tags: ['test'],
        schemaVersion: '1.0.0',
      },
      {
        id: 'a0000001-0000-4000-8000-000000000003',
        runId: RUN_ID,
        type: 'run.end',
        timestamp: '2026-03-15T10:00:05.000Z',
        sequence: 3,
        tenantId: TENANT_ID,
        sourceAgent: 'test-agent',
        payload: { status: 'success', durationMs: 4000 },
        tags: ['test'],
        schemaVersion: '1.0.0',
      },
    ] as unknown as EvidenceBundle['events'],
    timeline: {
      entries: [],
      gaps: [],
      summary: {
        runId: RUN_ID,
        tenantId: TENANT_ID,
        eventCount: 3,
        eventTypeCounts: { 'run.start': 1, 'tool.call.start': 1, 'run.end': 1 },
        durationMs: 4000,
        hasGaps: false,
        toolCount: 1,
        hasErrors: false,
      },
    } as unknown as EvidenceBundle['timeline'],
    lineageGraph: null,
    redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
    isPartialRun: false,
    partialRunMarker: null,
    errorMessage: null,
    bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
  };
}

function makeBundleRow(overrides: Partial<BundleRow> = {}): BundleRow {
  return {
    id: BUNDLE_ID,
    run_id: RUN_ID,
    tenant_id: TENANT_ID,
    status: 'complete',
    is_partial_run: false,
    error_message: null,
    bundle_data: makeCompleteBundleData(),
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    created_at: new Date('2026-03-15T10:00:00.000Z'),
    completed_at: new Date('2026-03-15T10:00:01.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PDF magic bytes check
// ---------------------------------------------------------------------------

function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-';
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PDF export routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(exportRoutes, { prefix: '/v1' });
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles/:bundleId/export?format=pdf
  // -----------------------------------------------------------------------
  describe('GET /v1/evidence/bundles/:bundleId/export?format=pdf', () => {
    it('returns 200 with PDF content and correct headers', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.pdf');

      const buf = Buffer.from(response.rawPayload);
      expect(isPdfBuffer(buf)).toBe(true);
    });

    it('includes run ID in the content-disposition filename', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toContain(RUN_ID);
      expect(disposition).toContain('evidence-');
    });

    it('supports full detail level via query param', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf&detail=full`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('supports sections parameter', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf&sections=executiveSummary,runMetadata`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('supports LETTER page size parameter', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf&pageSize=LETTER`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('returns 404 when bundle not found', async () => {
      mockGetBundleById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('BUNDLE_NOT_FOUND');
    });

    it('returns 422 when bundle_data is null (not assembled)', async () => {
      mockGetBundleById.mockResolvedValue(
        makeBundleRow({ bundle_data: null, status: 'pending' }),
      );

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('BUNDLE_NOT_ASSEMBLED');
    });

    it('returns 422 when bundle status is not complete', async () => {
      mockGetBundleById.mockResolvedValue(
        makeBundleRow({
          bundle_data: {
            ...makeCompleteBundleData(),
            status: 'failed',
          },
          status: 'failed',
        }),
      );

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('BUNDLE_NOT_COMPLETE');
    });

    it('returns 400 for invalid bundleId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/evidence/bundles/not-a-uuid/export?format=pdf',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_BUNDLE_ID');
    });

    it('returns 500 for unexpected errors', async () => {
      mockGetBundleById.mockRejectedValue(new Error('Connection lost'));

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('EXPORT_FAILED');
    });

    it('sets x-request-id header', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=pdf`,
      });

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Format validation still works for both json and pdf
  // -----------------------------------------------------------------------
  describe('format validation', () => {
    it('returns 400 for unsupported format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=csv`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_EXPORT_FORMAT');
    });

    it('returns 400 when format is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('still supports json format after adding pdf', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
