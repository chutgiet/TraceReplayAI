/**
 * POST /v1/traces — OTLP HTTP trace ingestion endpoint.
 *
 * Accepts OpenTelemetry ExportTraceServiceRequest in JSON format,
 * parses the nested resource/scope/span hierarchy into flat spans,
 * then enqueues each span as a RawVendorEvent on the normalization queue.
 *
 * This endpoint supports two deployment modes:
 *   1. OTel Collector → ingest-api  (collector forwards OTLP here)
 *   2. VS Code Copilot → ingest-api directly (no collector needed)
 *
 * Content types:
 *   - application/json  (OTLP JSON — fully supported)
 *   - application/x-protobuf  (OTLP Proto — returns 415 with guidance)
 */

import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { randomUUID } from 'node:crypto';
import {
  exportTraceServiceRequestSchema,
  parseOtlpTraces,
  spanToRawEvent,
} from '../parsers/otlp-parser.js';

const NORMALIZATION_QUEUE = 'normalization';
const DEFAULT_TENANT_ID = process.env['DEFAULT_TENANT_ID'] ?? 'org-tracereplay-dev';

// ---------------------------------------------------------------------------
// Route options
// ---------------------------------------------------------------------------

export interface OtlpTracesRouteOptions {
  redis: ConnectionOptions;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /v1/traces — OTLP HTTP trace receiver
 */
export async function otlpTracesRoutes(
  app: FastifyInstance,
  opts: OtlpTracesRouteOptions,
): Promise<void> {
  const queue = new Queue(NORMALIZATION_QUEUE, {
    connection: opts.redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await queue.close();
  });

  // -----------------------------------------------------------------------
  // Content-type handling
  // -----------------------------------------------------------------------

  // Fastify needs to be told to accept and parse the OTLP content types.
  // By default it only handles application/json. We add a raw parser for
  // protobuf so we can return a helpful 415.
  app.addContentTypeParser(
    'application/x-protobuf',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // -----------------------------------------------------------------------
  // POST /traces
  // -----------------------------------------------------------------------

  app.post<{ Body: unknown }>('/traces', async (request, reply) => {
    const contentType = request.headers['content-type'] ?? '';

    // ─── Protobuf: not supported yet ────────────────────────────────
    if (contentType.includes('application/x-protobuf')) {
      return reply.status(415).send({
        error: {
          code: 'UNSUPPORTED_CONTENT_TYPE',
          message:
            'Protobuf encoding is not yet supported. Please configure your OTLP exporter to use JSON. ' +
            'For the OTel Collector, the otlphttp exporter uses JSON by default.',
          requestId: request.id,
        },
      });
    }

    // ─── Parse & validate OTLP JSON ─────────────────────────────────
    const parsed = exportTraceServiceRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_OTLP_REQUEST',
          message: 'Request body is not a valid OTLP ExportTraceServiceRequest',
          details: parsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const otlpRequest = parsed.data;

    // ─── Empty request (valid per OTLP spec, just no-op) ────────────
    if (otlpRequest.resourceSpans.length === 0) {
      return reply.status(200).send({
        // Standard OTLP ExportTraceServiceResponse — empty means full success
        partialSuccess: {},
      });
    }

    // ─── Parse spans ────────────────────────────────────────────────
    const { spans, spanCount, resourceCount } = parseOtlpTraces(otlpRequest);

    if (spanCount === 0) {
      return reply.status(200).send({
        partialSuccess: {},
      });
    }

    // ─── Determine tenant ───────────────────────────────────────────
    // Allow tenant to be passed via header (from OTel Collector resource
    // processor or OTEL_EXPORTER_OTLP_HEADERS).
    const tenantId =
      (request.headers['x-tracereplay-tenant-id'] as string) ?? DEFAULT_TENANT_ID;
    const receivedAt = new Date().toISOString();

    // ─── Enqueue each span as a RawVendorEvent ──────────────────────
    const jobs = spans.map((span) => {
      const rawEvent = spanToRawEvent(span, tenantId, receivedAt);
      const jobId = randomUUID();

      return {
        name: 'normalize' as const,
        data: {
          jobId,
          rawEvent,
          attemptNumber: 0,
        },
        opts: { jobId },
      };
    });

    try {
      await queue.addBulk(jobs);
    } catch (err) {
      request.log.error(
        { err, spanCount, resourceCount },
        'Failed to enqueue OTLP spans for normalization',
      );
      return reply.status(500).send({
        error: {
          code: 'ENQUEUE_FAILED',
          message: 'Failed to enqueue spans for normalization',
          requestId: request.id,
        },
      });
    }

    request.log.info(
      { spanCount, resourceCount, tenantId },
      'OTLP traces accepted',
    );

    // ─── Standard OTLP response ─────────────────────────────────────
    // An empty partialSuccess means all spans were accepted.
    return reply.status(200).send({
      partialSuccess: {},
    });
  });
}
