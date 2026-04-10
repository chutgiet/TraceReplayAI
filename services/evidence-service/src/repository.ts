import type { Pool } from 'pg';
import type {
  BundleRow,
  InsertBundleRow,
  BundleStatus,
  EvidenceBundle,
} from './types.js';

// ---------------------------------------------------------------------------
// evidence_bundles queries
// ---------------------------------------------------------------------------

export async function insertBundle(
  bundle: InsertBundleRow,
  pool: Pool,
): Promise<BundleRow> {
  const result = await pool.query<BundleRow>(
    `INSERT INTO evidence_bundles (
       id, run_id, tenant_id, status, is_partial_run,
       error_message, bundle_data, bundle_schema_version,
       root_integrity_hash
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9
     )
     RETURNING *`,
    [
      bundle.id,
      bundle.run_id,
      bundle.tenant_id,
      bundle.status,
      bundle.is_partial_run ?? false,
      bundle.error_message ?? null,
      bundle.bundle_data ? JSON.stringify(bundle.bundle_data) : null,
      bundle.bundle_schema_version,
      bundle.root_integrity_hash ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error(`insertBundle: no row returned for id=${bundle.id}`);
  return row;
}

export async function updateBundleStatus(
  id: string,
  status: BundleStatus,
  bundleData: EvidenceBundle | null,
  errorMessage: string | null,
  pool: Pool,
): Promise<void> {
  const completedAt = status === 'complete' ? new Date() : null;

  await pool.query(
    `UPDATE evidence_bundles
     SET status = $2,
         completed_at = $3,
         bundle_data = $4,
         error_message = $5,
         is_partial_run = $6,
         root_integrity_hash = $7
     WHERE id = $1`,
    [
      id,
      status,
      completedAt,
      bundleData ? JSON.stringify(bundleData) : null,
      errorMessage,
      bundleData?.isPartialRun ?? false,
      bundleData?.rootIntegrityHash ?? null,
    ],
  );
}

export async function getBundleById(
  id: string,
  pool: Pool,
): Promise<BundleRow | null> {
  const result = await pool.query<BundleRow>(
    'SELECT * FROM evidence_bundles WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getBundlesByRunId(
  runId: string,
  pool: Pool,
): Promise<BundleRow[]> {
  const result = await pool.query<BundleRow>(
    'SELECT * FROM evidence_bundles WHERE run_id = $1 ORDER BY created_at DESC',
    [runId],
  );
  return result.rows;
}

export async function listBundles(
  tenantId: string,
  limit: number,
  pool: Pool,
): Promise<BundleRow[]> {
  const result = await pool.query<BundleRow>(
    'SELECT * FROM evidence_bundles WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
    [tenantId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows;
}
