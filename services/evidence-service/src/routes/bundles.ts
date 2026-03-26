import type { FastifyInstance } from 'fastify';
import { getPool } from '@tracereplay/common';
import { EvidenceBundleAssembler, AssemblyError } from '../assembler.js';
import { getBundleById, getBundlesByRunId, listBundles } from '../repository.js';
import {
  createBundleBodySchema,
  bundleIdParamSchema,
  bundlesByRunQuerySchema,
  listBundlesQuerySchema,
} from '../validators.js';
import type { BundleRow } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBundleSummary(row: BundleRow): Record<string, unknown> {
  return {
    id: row.id,
    runId: row.run_id,
    tenantId: row.tenant_id,
    status: row.status,
    isPartialRun: row.is_partial_run,
    errorMessage: row.error_message,
    bundleSchemaVersion: row.bundle_schema_version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
  };
}

function formatBundleResponse(row: BundleRow): Record<string, unknown> {
  if (row.bundle_data) {
    return row.bundle_data as unknown as Record<string, unknown>;
  }
  return formatBundleSummary(row);
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function bundlesRoutes(app: FastifyInstance): Promise<void> {
  const pool = getPool();

  // -----------------------------------------------------------------------
  // POST /v1/evidence/bundles — assemble a new evidence bundle for a run
  // -----------------------------------------------------------------------
  app.post('/evidence/bundles', async (request, reply) => {
    const parsed = createBundleBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST_BODY',
          message: 'Request body failed validation',
          details: parsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { runId, tenantId } = parsed.data;

    try {
      const assembler = new EvidenceBundleAssembler(pool);
      const result = await assembler.assemble({ runId, tenantId });

      return reply.status(201).send({
        data: result.bundle,
        meta: { requestId: request.id },
      });
    } catch (err) {
      if (err instanceof AssemblyError) {
        const statusCode = err.code === 'RUN_NOT_FOUND' ? 404
          : err.code === 'TENANT_MISMATCH' ? 403
          : 422;

        return reply.status(statusCode).send({
          error: {
            code: err.code,
            message: err.message,
            requestId: request.id,
          },
        });
      }

      request.log.error({ err, runId }, 'Failed to assemble evidence bundle');
      return reply.status(500).send({
        error: {
          code: 'ASSEMBLY_FAILED',
          message: 'Internal error while assembling evidence bundle',
          requestId: request.id,
        },
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles/:bundleId — retrieve an assembled bundle
  // -----------------------------------------------------------------------
  app.get('/evidence/bundles/:bundleId', async (request, reply) => {
    const paramParsed = bundleIdParamSchema.safeParse(request.params);

    if (!paramParsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_BUNDLE_ID',
          message: 'bundleId must be a valid UUID',
          details: paramParsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { bundleId } = paramParsed.data;

    try {
      const row = await getBundleById(bundleId, pool);

      if (!row) {
        return reply.status(404).send({
          error: {
            code: 'BUNDLE_NOT_FOUND',
            message: `Evidence bundle ${bundleId} not found`,
            requestId: request.id,
          },
        });
      }

      return reply.status(200).send({
        data: formatBundleResponse(row),
        meta: { requestId: request.id },
      });
    } catch (err) {
      request.log.error({ err, bundleId }, 'Failed to retrieve evidence bundle');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while retrieving evidence bundle',
          requestId: request.id,
        },
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles — list bundles (by run or by tenant)
  // -----------------------------------------------------------------------
  app.get('/evidence/bundles', async (request, reply) => {
    // Try run-scoped query first, fall back to tenant list
    const query = request.query as Record<string, unknown>;

    if (query['runId']) {
      const parsed = bundlesByRunQuerySchema.safeParse(query);

      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Query parameters failed validation',
            details: parsed.error.issues,
            requestId: request.id,
          },
        });
      }

      try {
        const rows = await getBundlesByRunId(parsed.data.runId, pool);

        return reply.status(200).send({
          data: rows.map(formatBundleSummary),
          meta: {
            requestId: request.id,
            count: rows.length,
          },
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to list bundles for run');
        return reply.status(500).send({
          error: {
            code: 'QUERY_FAILED',
            message: 'Internal error while listing bundles',
            requestId: request.id,
          },
        });
      }
    }

    // Tenant-scoped list
    const parsed = listBundlesQuerySchema.safeParse(query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_QUERY_PARAMS',
          message: 'Query parameters failed validation',
          details: parsed.error.issues,
          requestId: request.id,
        },
      });
    }

    try {
      const rows = await listBundles(parsed.data.tenantId, parsed.data.limit ?? 20, pool);

      return reply.status(200).send({
        data: rows.map(formatBundleSummary),
        meta: {
          requestId: request.id,
          count: rows.length,
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to list bundles');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while listing bundles',
          requestId: request.id,
        },
      });
    }
  });
}
