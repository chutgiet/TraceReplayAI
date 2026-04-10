import type { FastifyInstance } from 'fastify';
import { getPool } from '@tracereplay/common';
import { getBundleById } from '../repository.js';
import { verifyIntegrityChain } from '../integrity.js';
import { bundleIdParamSchema } from '../validators.js';
import type { EvidenceBundle } from '../types.js';

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function verifyRoutes(app: FastifyInstance): Promise<void> {
  const pool = getPool();

  // -----------------------------------------------------------------------
  // POST /v1/evidence/bundles/:bundleId/verify — verify integrity chain
  // -----------------------------------------------------------------------
  app.post('/evidence/bundles/:bundleId/verify', async (request, reply) => {
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

      if (row.status !== 'complete' || !row.bundle_data) {
        return reply.status(422).send({
          error: {
            code: 'BUNDLE_NOT_COMPLETE',
            message: `Evidence bundle ${bundleId} is not complete (status: ${row.status})`,
            requestId: request.id,
          },
        });
      }

      const bundle = row.bundle_data as EvidenceBundle;
      const result = verifyIntegrityChain(bundle);

      return reply.status(200).send({
        data: {
          bundleId,
          ...result,
        },
        meta: { requestId: request.id },
      });
    } catch (err) {
      request.log.error({ err, bundleId }, 'Failed to verify evidence bundle integrity');
      return reply.status(500).send({
        error: {
          code: 'VERIFY_FAILED',
          message: 'Internal error while verifying evidence bundle integrity',
          requestId: request.id,
        },
      });
    }
  });
}
