import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { bundlesRoutes } from '../routes/bundles.js';
import type { BundleRow, EvidenceBundle } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @tracereplay/common to avoid real DB connections
vi.mock('@tracereplay/common', () => ({
  getPool: vi.fn(() => ({})),
  closePool: vi.fn(),
}));

// Mock the assembler
const mockAssemble = vi.fn();
vi.mock('../assembler.js', () => ({
  EvidenceBundleAssembler: vi.fn().mockImplementation(() => ({
    assemble: mockAssemble,
  })),
  AssemblyError: class AssemblyError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'AssemblyError';
      this.code = code;
    }
  },
}));

// Mock the repository
const mockGetBundleById = vi.fn();
const mockGetBundlesByRunId = vi.fn();
const mockListBundles = vi.fn();
vi.mock('../repository.js', () => ({
  getBundleById: (...args: unknown[]) => mockGetBundleById(...args),
  getBundlesByRunId: (...args: unknown[]) => mockGetBundlesByRunId(...args),
  listBundles: (...args: unknown[]) => mockListBundles(...args),
  insertBundle: vi.fn(),
  updateBundleStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const BUNDLE_ID = 'd0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeBundleRow(overrides: Partial<BundleRow> = {}): BundleRow {
  return {
    id: BUNDLE_ID,
    run_id: RUN_ID,
    tenant_id: TENANT_ID,
    status: 'complete',
    is_partial_run: false,
    error_message: null,
    bundle_data: {
      id: BUNDLE_ID,
      runId: RUN_ID,
      tenantId: TENANT_ID,
      status: 'complete',
      createdAt: '2026-03-15T10:00:00.000Z',
      completedAt: '2026-03-15T10:00:01.000Z',
      runMetadata: null,
      events: [],
      timeline: null,
      lineageGraph: null,
      redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
      isPartialRun: false,
      partialRunMarker: null,
      errorMessage: null,
      integrityChain: null,
      rootIntegrityHash: null,
      bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
    } as unknown as EvidenceBundle,
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

describe('bundles routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(bundlesRoutes, { prefix: '/v1' });
    await app.ready();

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // POST /v1/evidence/bundles
  // -----------------------------------------------------------------------
  describe('POST /v1/evidence/bundles', () => {
    it('returns 201 with assembled bundle', async () => {
      const mockBundle: EvidenceBundle = {
        id: BUNDLE_ID as EvidenceBundle['id'],
        runId: RUN_ID,
        tenantId: TENANT_ID,
        status: 'complete',
        createdAt: '2026-03-15T10:00:00.000Z',
        completedAt: '2026-03-15T10:00:01.000Z',
        runMetadata: null,
        events: [],
        timeline: null,
        lineageGraph: null,
        redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
        isPartialRun: false,
        partialRunMarker: null,
        errorMessage: null,
        integrityChain: null,
        rootIntegrityHash: null,
        bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
      };

      mockAssemble.mockResolvedValue({ bundle: mockBundle });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: { runId: RUN_ID, tenantId: TENANT_ID },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(BUNDLE_ID);
      expect(body.data.status).toBe('complete');
      expect(body.meta.requestId).toBeDefined();
    });

    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: { runId: 'not-a-uuid' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_REQUEST_BODY');
    });

    it('returns 400 for missing body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when run not found', async () => {
      const { AssemblyError } = await import('../assembler.js');
      mockAssemble.mockRejectedValue(new AssemblyError('Run not found', 'RUN_NOT_FOUND'));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: { runId: RUN_ID, tenantId: TENANT_ID },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('RUN_NOT_FOUND');
    });

    it('returns 403 when tenant mismatches', async () => {
      const { AssemblyError } = await import('../assembler.js');
      mockAssemble.mockRejectedValue(new AssemblyError('Tenant mismatch', 'TENANT_MISMATCH'));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: { runId: RUN_ID, tenantId: TENANT_ID },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('TENANT_MISMATCH');
    });

    it('returns 500 for unexpected errors', async () => {
      mockAssemble.mockRejectedValue(new Error('Database connection lost'));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/evidence/bundles',
        payload: { runId: RUN_ID, tenantId: TENANT_ID },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ASSEMBLY_FAILED');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles/:bundleId
  // -----------------------------------------------------------------------
  describe('GET /v1/evidence/bundles/:bundleId', () => {
    it('returns 200 with bundle data', async () => {
      mockGetBundleById.mockResolvedValue(makeBundleRow());

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(BUNDLE_ID);
      expect(body.meta.requestId).toBeDefined();
    });

    it('returns 404 when bundle not found', async () => {
      mockGetBundleById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}`,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('BUNDLE_NOT_FOUND');
    });

    it('returns 400 for invalid bundleId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/evidence/bundles/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_BUNDLE_ID');
    });

    it('returns summary when bundle_data is null', async () => {
      mockGetBundleById.mockResolvedValue(
        makeBundleRow({ bundle_data: null, status: 'pending' }),
      );

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles/${BUNDLE_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(BUNDLE_ID);
      expect(body.data.status).toBe('pending');
    });
  });

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles (list)
  // -----------------------------------------------------------------------
  describe('GET /v1/evidence/bundles', () => {
    it('lists bundles by runId', async () => {
      mockGetBundlesByRunId.mockResolvedValue([makeBundleRow()]);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles?runId=${RUN_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(BUNDLE_ID);
      expect(body.meta.count).toBe(1);
    });

    it('lists bundles by tenantId', async () => {
      mockListBundles.mockResolvedValue([makeBundleRow()]);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles?tenantId=${TENANT_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.meta.count).toBe(1);
    });

    it('returns 400 when no query params', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/evidence/bundles',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns empty array when no bundles found', async () => {
      mockListBundles.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/evidence/bundles?tenantId=${TENANT_ID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(0);
      expect(body.meta.count).toBe(0);
    });
  });
});
