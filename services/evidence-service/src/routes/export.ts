import type { FastifyInstance } from 'fastify';
import { getPool } from '@tracereplay/common';
import { getBundleById } from '../repository.js';
import { bundleIdParamSchema, exportQuerySchema } from '../validators.js';
import { EvidenceJsonExporter, ExportError } from '../exporters/json-exporter.js';
import { JSON_EXPORT_MIME_TYPE } from '../export-types.js';

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const pool = getPool();

  // -----------------------------------------------------------------------
  // GET /v1/evidence/bundles/:bundleId/export?format=json
  //
  // Exports the evidence bundle in the requested format (currently JSON).
  // Returns the file as a downloadable attachment with Content-Disposition.
  // -----------------------------------------------------------------------
  app.get('/evidence/bundles/:bundleId/export', async (request, reply) => {
    // Validate path parameter
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

    // Validate query parameter
    const queryParsed = exportQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_EXPORT_FORMAT',
          message: 'Missing or unsupported export format',
          details: queryParsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { bundleId } = paramParsed.data;
    const { format } = queryParsed.data;

    try {
      // Retrieve the bundle from the DB
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

      if (!row.bundle_data) {
        return reply.status(422).send({
          error: {
            code: 'BUNDLE_NOT_ASSEMBLED',
            message: `Evidence bundle ${bundleId} has not been assembled yet (status: ${row.status})`,
            requestId: request.id,
          },
        });
      }

      // Export based on format
      if (format === 'json') {
        return await exportJson(row.bundle_data, bundleId, request.id, reply);
      }

      // Unreachable due to Zod enum validation, but TypeScript exhaustiveness
      return reply.status(400).send({
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: `Export format "${format}" is not supported`,
          requestId: request.id,
        },
      });
    } catch (err) {
      if (err instanceof ExportError) {
        return reply.status(422).send({
          error: {
            code: err.code,
            message: err.message,
            requestId: request.id,
          },
        });
      }

      request.log.error({ err, bundleId, format }, 'Failed to export evidence bundle');
      return reply.status(500).send({
        error: {
          code: 'EXPORT_FAILED',
          message: 'Internal error while exporting evidence bundle',
          requestId: request.id,
        },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Format-specific export helpers
// ---------------------------------------------------------------------------

import type { FastifyReply } from 'fastify';
import type { EvidenceBundle } from '../types.js';

async function exportJson(
  bundle: EvidenceBundle,
  bundleId: string,
  requestId: string,
  reply: FastifyReply,
): Promise<void> {
  const exporter = new EvidenceJsonExporter({ pretty: true });
  const json = exporter.export(bundle);
  const filename = EvidenceJsonExporter.generateFilename(bundle);

  return reply
    .status(200)
    .header('content-type', `${JSON_EXPORT_MIME_TYPE}; charset=utf-8`)
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('x-request-id', requestId)
    .send(json);
}
