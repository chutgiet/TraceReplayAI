import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRunById, getEventsByRunId } from '@tracereplay/common';
import type { EventRow } from '@tracereplay/common';
import type { TraceReplayEvent, EventId, RunId, TenantId, EventType } from '@tracereplay/event-schema';
import { buildTimeline } from '@tracereplay/replay-engine';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const runIdParamSchema = z.object({
  runId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a DB EventRow to a canonical TraceReplayEvent for the replay engine. */
function toCanonicalEvent(row: EventRow): TraceReplayEvent {
  return {
    id: row.id as EventId,
    runId: row.run_id as RunId,
    type: row.type as EventType,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    sequence: row.sequence ?? undefined,
    parentEventId: (row.parent_event_id as EventId) ?? undefined,
    tenantId: row.tenant_id as TenantId,
    sourceAgent: row.source_agent,
    sourceFramework: row.source_framework ?? undefined,
    payload: row.payload,
    rawMeta: row.raw_meta ?? undefined,
    tags: row.tags,
    schemaVersion: row.schema_version,
  } as TraceReplayEvent;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function timelineRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // GET /v1/runs/:runId/timeline — replay timeline for a run
  // -----------------------------------------------------------------------
  app.get('/runs/:runId/timeline', async (request, reply) => {
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

      const eventRows = await getEventsByRunId(runId);
      const events = eventRows.map(toCanonicalEvent);
      const timeline = buildTimeline(events);

      return reply.status(200).send({
        data: timeline,
        meta: { requestId: request.id },
      });
    } catch (err) {
      request.log.error({ err, runId }, 'Failed to build timeline');
      return reply.status(500).send({
        error: {
          code: 'TIMELINE_FAILED',
          message: 'Internal error while building timeline',
          requestId: request.id,
        },
      });
    }
  });
}
