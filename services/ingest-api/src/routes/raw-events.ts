import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Validation — RawVendorEvent shape
// ---------------------------------------------------------------------------

const rawVendorEventSchema = z.object({
  vendor: z.string().min(1),
  data: z.record(z.unknown()),
  receivedAt: z.string().datetime().optional(),
  tenantId: z.string().min(1),
  runId: z.string().optional(),
});

const NORMALIZATION_QUEUE = 'normalization';

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export interface RawEventsRouteOptions {
  redis: ConnectionOptions;
}

/**
 * POST /v1/raw-events       — enqueue a single raw vendor event for normalization
 * POST /v1/raw-events/batch — enqueue multiple raw vendor events
 */
export async function rawEventsRoutes(
  app: FastifyInstance,
  opts: RawEventsRouteOptions,
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
  // POST /raw-events — single raw event
  // -----------------------------------------------------------------------
  app.post<{ Body: unknown }>('/raw-events', async (request, reply) => {
    const parsed = rawVendorEventSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_RAW_EVENT',
          message: 'Raw event payload failed validation',
          details: parsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const raw = {
      ...parsed.data,
      receivedAt: parsed.data.receivedAt ?? new Date().toISOString(),
    };

    const jobId = randomUUID();

    await queue.add('normalize', {
      jobId,
      rawEvent: raw,
      attemptNumber: 0,
    }, { jobId });

    return reply.status(202).send({
      data: {
        jobId,
        status: 'queued',
        vendor: raw.vendor,
      },
      meta: { requestId: request.id },
    });
  });

  // -----------------------------------------------------------------------
  // POST /raw-events/batch — multiple raw events
  // -----------------------------------------------------------------------
  app.post<{ Body: unknown }>('/raw-events/batch', async (request, reply) => {
    const body = request.body;

    if (!Array.isArray(body)) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_BATCH',
          message: 'Request body must be a JSON array of raw events',
          requestId: request.id,
        },
      });
    }

    if (body.length === 0) {
      return reply.status(400).send({
        error: {
          code: 'EMPTY_BATCH',
          message: 'Batch must contain at least one event',
          requestId: request.id,
        },
      });
    }

    if (body.length > 100) {
      return reply.status(400).send({
        error: {
          code: 'BATCH_TOO_LARGE',
          message: 'Batch must not exceed 100 events',
          requestId: request.id,
        },
      });
    }

    // Validate all events
    const validated: Array<{ vendor: string; data: Record<string, unknown>; receivedAt: string; tenantId: string; runId?: string }> = [];
    const errors: Array<{ index: number; issues: unknown }> = [];

    for (let i = 0; i < body.length; i++) {
      const parsed = rawVendorEventSchema.safeParse(body[i]);
      if (parsed.success) {
        validated.push({
          ...parsed.data,
          receivedAt: parsed.data.receivedAt ?? new Date().toISOString(),
        });
      } else {
        errors.push({ index: i, issues: parsed.error.issues });
      }
    }

    if (errors.length > 0) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_BATCH_EVENTS',
          message: `${errors.length} event(s) failed validation`,
          details: errors,
          requestId: request.id,
        },
      });
    }

    // Enqueue all
    const results = await Promise.all(
      validated.map(async (raw) => {
        const jobId = randomUUID();
        await queue.add('normalize', {
          jobId,
          rawEvent: raw,
          attemptNumber: 0,
        }, { jobId });
        return { jobId, status: 'queued' as const, vendor: raw.vendor };
      }),
    );

    return reply.status(202).send({
      data: results,
      meta: { requestId: request.id, count: results.length },
    });
  });
}
