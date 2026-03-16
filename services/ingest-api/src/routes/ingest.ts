import type { FastifyInstance } from 'fastify';
import { validateEvent, traceReplayEventSchema } from '@tracereplay/event-schema';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import { ingestEvent, ingestEventBatch } from '../services/ingest-service.js';

/**
 * POST /v1/events       — single event
 * POST /v1/events/batch — array of events
 */
export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // POST /events — ingest a single event
  // -----------------------------------------------------------------------
  app.post<{ Body: unknown }>('/events', async (request, reply) => {
    const validation = validateEvent(request.body);

    if (!validation.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_EVENT_SCHEMA',
          message: 'Event payload failed schema validation',
          details: validation.error.issues,
          requestId: request.id,
        },
      });
    }

    try {
      const result = await ingestEvent(validation.data);

      if (result.status === 'duplicate') {
        return reply.status(200).send({
          data: { eventId: result.eventId, status: 'duplicate' },
          meta: { requestId: request.id },
        });
      }

      return reply.status(201).send({
        data: { eventId: result.eventId, status: 'created' },
        meta: { requestId: request.id },
      });
    } catch (err) {
      request.log.error({ err, eventId: (request.body as Record<string, unknown>)?.['id'] }, 'Failed to ingest event');
      return reply.status(500).send({
        error: {
          code: 'INGEST_FAILED',
          message: 'Internal error while persisting event',
          requestId: request.id,
        },
      });
    }
  });

  // -----------------------------------------------------------------------
  // POST /events/batch — ingest multiple events
  // -----------------------------------------------------------------------
  app.post<{ Body: unknown }>('/events/batch', async (request, reply) => {
    const body = request.body;

    if (!Array.isArray(body)) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_BATCH',
          message: 'Request body must be a JSON array of events',
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

    // Validate all events upfront
    const validated: TraceReplayEvent[] = [];
    const errors: Array<{ index: number; issues: unknown }> = [];

    for (let i = 0; i < body.length; i++) {
      const result = traceReplayEventSchema.safeParse(body[i]);
      if (result.success) {
        validated.push(result.data as TraceReplayEvent);
      } else {
        errors.push({ index: i, issues: result.error.issues });
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

    try {
      const results = await ingestEventBatch(validated);
      return reply.status(201).send({
        data: results,
        meta: { requestId: request.id, count: results.length },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to ingest batch');
      return reply.status(500).send({
        error: {
          code: 'INGEST_BATCH_FAILED',
          message: 'Internal error while persisting event batch',
          requestId: request.id,
        },
      });
    }
  });
}
