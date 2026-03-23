import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listRuns,
  getRunById,
  getEventsByRunId,
} from '@tracereplay/common';
import type { ListRunsFilter, CursorPage, RunRow, RunListRow } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Zod schemas for query-string validation
// ---------------------------------------------------------------------------

const listRunsQuerySchema = z.object({
  status: z.enum(['running', 'success', 'failure', 'timeout', 'cancelled']).optional(),
  agentId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  startedAfter: z.string().datetime().optional(),
  startedBefore: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const runIdParamSchema = z.object({
  runId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRunResponse(run: RunRow | RunListRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: run.id,
    tenantId: run.tenant_id,
    agentId: run.agent_id,
    runName: run.run_name,
    triggerSource: run.trigger_source,
    parentRunId: run.parent_run_id,
    status: run.status,
    startedAt: run.started_at.toISOString(),
    endedAt: run.ended_at?.toISOString() ?? null,
    tags: run.tags,
    metadata: run.metadata,
    schemaVersion: run.schema_version,
    createdAt: run.created_at.toISOString(),
    updatedAt: run.updated_at.toISOString(),
  };

  if ('event_count' in run) {
    base.eventCount = parseInt(String(run.event_count), 10);
  }

  return base;
}

function computeRunSummary(run: RunRow, eventCount: number): Record<string, unknown> {
  const durationMs =
    run.ended_at && run.started_at
      ? run.ended_at.getTime() - run.started_at.getTime()
      : null;

  return {
    eventCount,
    durationMs,
    status: run.status,
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function runsRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // GET /v1/runs — list runs with filters + cursor-based pagination
  // -----------------------------------------------------------------------
  app.get('/runs', async (request, reply) => {
    const parsed = listRunsQuerySchema.safeParse(request.query);

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

    const { status, agentId, tenantId, startedAfter, startedBefore, cursor, limit } = parsed.data;

    const filter: ListRunsFilter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (status) filter.status = status;
    if (agentId) filter.agentId = agentId;
    if (startedAfter) filter.startedAfter = new Date(startedAfter);
    if (startedBefore) filter.startedBefore = new Date(startedBefore);

    const page: CursorPage = {};
    if (cursor) page.cursor = cursor;
    if (limit !== undefined) page.limit = limit;

    try {
      const result = await listRuns(filter, page);

      return reply.status(200).send({
        data: result.runs.map(formatRunResponse),
        meta: {
          requestId: request.id,
          nextCursor: result.nextCursor,
          count: result.runs.length,
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to list runs');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while querying runs',
          requestId: request.id,
        },
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /v1/runs/:runId — get single run details + summary
  // -----------------------------------------------------------------------
  app.get('/runs/:runId', async (request, reply) => {
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

      const events = await getEventsByRunId(runId);
      const summary = computeRunSummary(run, events.length);

      return reply.status(200).send({
        data: {
          ...formatRunResponse(run),
          summary,
        },
        meta: { requestId: request.id },
      });
    } catch (err) {
      request.log.error({ err, runId }, 'Failed to get run');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while querying run',
          requestId: request.id,
        },
      });
    }
  });
}
