import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  insertBundle,
  updateBundleStatus,
  getBundleById,
  getBundlesByRunId,
  listBundles,
} from '../repository.js';
import type { BundleRow, InsertBundleRow } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUNDLE_ID = 'd0000001-0000-4000-8000-000000000001';
const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeBundleRow(): BundleRow {
  return {
    id: BUNDLE_ID,
    run_id: RUN_ID,
    tenant_id: TENANT_ID,
    status: 'complete',
    is_partial_run: false,
    error_message: null,
    bundle_data: null,
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    root_integrity_hash: null,
    created_at: new Date('2026-03-15T10:00:00.000Z'),
    completed_at: new Date('2026-03-15T10:00:01.000Z'),
  };
}

function createMockPool(queryResponse: { rows: unknown[]; rowCount: number }): Pool {
  return {
    query: vi.fn().mockResolvedValue(queryResponse),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('repository', () => {
  describe('insertBundle', () => {
    it('inserts a bundle and returns the row', async () => {
      const row = makeBundleRow();
      const pool = createMockPool({ rows: [row], rowCount: 1 });

      const input: InsertBundleRow = {
        id: BUNDLE_ID,
        run_id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'pending',
        bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      };

      const result = await insertBundle(input, pool);
      expect(result.id).toBe(BUNDLE_ID);
      expect((pool.query as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();

      // Verify parameterized query
      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1]).toContain(BUNDLE_ID);
      expect(call[1]).toContain(RUN_ID);
      expect(call[1]).toContain(TENANT_ID);
    });

    it('throws when no row returned', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });

      const input: InsertBundleRow = {
        id: BUNDLE_ID,
        run_id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'pending',
        bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      };

      await expect(insertBundle(input, pool)).rejects.toThrow(/no row returned/);
    });
  });

  describe('updateBundleStatus', () => {
    it('calls UPDATE with correct parameters', async () => {
      const pool = createMockPool({ rows: [], rowCount: 1 });

      await updateBundleStatus(BUNDLE_ID, 'complete', null, null, pool);

      expect((pool.query as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1][0]).toBe(BUNDLE_ID);
      expect(call[1][1]).toBe('complete');
    });

    it('sets completed_at when status is complete', async () => {
      const pool = createMockPool({ rows: [], rowCount: 1 });

      await updateBundleStatus(BUNDLE_ID, 'complete', null, null, pool);

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // completed_at should be a Date (not null) for complete status
      expect(call[1][2]).toBeInstanceOf(Date);
    });

    it('sets completed_at to null when status is not complete', async () => {
      const pool = createMockPool({ rows: [], rowCount: 1 });

      await updateBundleStatus(BUNDLE_ID, 'assembling', null, null, pool);

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1][2]).toBeNull();
    });
  });

  describe('getBundleById', () => {
    it('returns bundle row when found', async () => {
      const row = makeBundleRow();
      const pool = createMockPool({ rows: [row], rowCount: 1 });

      const result = await getBundleById(BUNDLE_ID, pool);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(BUNDLE_ID);
    });

    it('returns null when not found', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });

      const result = await getBundleById('nonexistent-id', pool);
      expect(result).toBeNull();
    });
  });

  describe('getBundlesByRunId', () => {
    it('returns bundles ordered by created_at desc', async () => {
      const rows = [makeBundleRow()];
      const pool = createMockPool({ rows, rowCount: 1 });

      const result = await getBundlesByRunId(RUN_ID, pool);
      expect(result).toHaveLength(1);

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect((call[0] as string).includes('ORDER BY created_at DESC')).toBe(true);
    });
  });

  describe('listBundles', () => {
    it('clamps limit to valid range', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });

      await listBundles(TENANT_ID, 200, pool);

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      // Should be clamped to 100
      expect(call[1][1]).toBe(100);
    });

    it('clamps minimum limit to 1', async () => {
      const pool = createMockPool({ rows: [], rowCount: 0 });

      await listBundles(TENANT_ID, 0, pool);

      const call = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1][1]).toBe(1);
    });
  });
});
