import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRunById, getEventsByRunId } from '@tracereplay/common';
import type { EventRow } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const runIdParamSchema = z.object({
  runId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventResponse(event: EventRow): Record<string, unknown> {
  return {
    id: event.id,
    runId: event.run_id,
    tenantId: event.tenant_id,
    type: event.type,
    sequence: event.sequence,
    parentEventId: event.parent_event_id,
    sourceAgent: event.source_agent,
    sourceFramework: event.source_framework,
    payload: event.payload,
    rawMeta: event.raw_meta,
    tags: event.tags,
    schemaVersion: event.schema_version,
    timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
    receivedAt: event.received_at instanceof Date ? event.received_at.toISOString() : event.received_at,
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // GET /v1/runs/:runId/events — get ordered events for a run
  // -----------------------------------------------------------------------
  app.get('/runs/:runId/events', async (request, reply) => {
    const paramParsed = runIdParamSchema.safeParse(request.params);

    if (!paramParsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_RUN_ID',
          message: 'runId must be a valid UUID',
          details: paramParsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { runId } = paramParsed.data;

    try {
      // Verify the run exists first
      const run = await getRunById(runId);

      if (!run) {
        return reply.status(404).send({
          error: {
            code: 'RUN_NOT_FOUND',
            message: `Run ${runId} not found`,
            requestId: request.id,
          },
        });
      }

      const events = await getEventsByRunId(runId);

      return reply.status(200).send({
        data: events.map(formatEventResponse),
        meta: {
          requestId: request.id,
          count: events.length,
        },
      });
    } catch (err) {
      request.log.error({ err, runId }, 'Failed to get events');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while querying events',
          requestId: request.id,
        },
      });
    }
  });
}
