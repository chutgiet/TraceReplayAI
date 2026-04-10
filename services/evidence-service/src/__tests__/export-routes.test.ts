import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { exportRoutes } from '../routes/export.js';
import type { BundleRow, EvidenceBundle } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';
import { EXPORT_SCHEMA_VERSION } from '../export-types.js';

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
        type: 'run.end',
        timestamp: '2026-03-15T10:00:05.000Z',
        sequence: 2,
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
        eventCount: 2,
        durationMs: 4000,
        eventTypeCounts: { 'run.start': 1, 'run.end': 1 },
        hasGaps: false,
        toolCount: 0,
        hasErrors: false,
      },
    } as unknown as EvidenceBundle['timeline'],
    lineageGraph: null,
    redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
    isPartialRun: false,
    partialRunMarker: null,
    errorMessage: null,
    integrityChain: null,
    rootIntegrityHash: null,
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
    root_integrity_hash: null,
    created_at: new Date('2026-03-15T10:00:00.000Z'),
    completed_at: new Date('2026-03-15T10:00:01.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('export routes', () => {
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
  // GET /v1/evidence/bundles/:bundleId/export?format=json
  // -----------------------------------------------------------------------
  describe('GET /v1/evidence/bundles/:bundleId/export?format=json', () => {
    it('returns 200 with JSON export and correct headers', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      expect(response.statusCode).toBe(200);

      // Check content type
      expect(response.headers['content-type']).toContain('application/json');

      // Check content-disposition for file download
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.json');

      // Verify the body is valid JSON export
      const body = JSON.parse(response.body);
      expect(body.formatId).toBe('tracereplay-evidence-export');
      expect(body.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
      expect(body.integrityHash).toBeDefined();
      expect(typeof body.integrityHash).toBe('string');
    });

    it('includes all required export fields', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('formatId');
      expect(body).toHaveProperty('schemaVersion');
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('bundle');
      expect(body).toHaveProperty('run');
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('timeline');
      expect(body).toHaveProperty('lineage');
      expect(body).toHaveProperty('redactionAudit');
      expect(body).toHaveProperty('integrityHash');
    });

    it('returns 400 for invalid bundleId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/evidence/bundles/not-a-uuid/export?format=json',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_BUNDLE_ID');
    });

    it('returns 400 when format query param is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_EXPORT_FORMAT');
    });

    it('returns 400 for unsupported format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=csv`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_EXPORT_FORMAT');
    });

    it('returns 404 when bundle not found', async () => {
      mockGetBundleById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
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
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
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
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('BUNDLE_NOT_COMPLETE');
    });

    it('returns 500 for unexpected DB errors', async () => {
      mockGetBundleById.mockRejectedValue(new Error('Connection lost'));

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('EXPORT_FAILED');
    });

    it('sets content-disposition filename with run ID', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toContain(RUN_ID);
      expect(disposition).toContain('evidence-');
    });

    it('produces JSON that passes round-trip validation', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}/export?format=json`,
      });

      const parsed = JSON.parse(response.body);

      // Import and validate
      const { EvidenceJsonExporter } = await import('../exporters/json-exporter.js');
      const result = EvidenceJsonExporter.validate(parsed);
      expect(result.valid).toBe(true);

      // Verify integrity
      if (result.valid) {
        expect(EvidenceJsonExporter.verifyIntegrity(result.data)).toBe(true);
      }
    });
  });
});
