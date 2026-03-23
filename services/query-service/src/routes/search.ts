import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchEvents } from '@tracereplay/common';
import type { SearchEventsFilter, SearchEventsPage, EventRow } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Zod schemas for query-string validation
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  tenantId: z.string().min(1).optional(),
  runId: z.string().uuid().optional(),
  eventTypes: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((t) => t.trim()).filter(Boolean) : undefined)),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSearchEventResponse(
  event: EventRow & { rank: number; headline: string },
): Record<string, unknown> {
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
    tags: event.tags,
    schemaVersion: event.schema_version,
    timestamp:
      event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : event.timestamp,
    receivedAt:
      event.received_at instanceof Date
        ? event.received_at.toISOString()
        : event.received_at,
    rank: event.rank,
    headline: event.headline,
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // GET /v1/search — full-text search across event payloads
  // -----------------------------------------------------------------------
  app.get('/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_SEARCH_PARAMS',
          message: 'Search parameters failed validation',
          details: parsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { q, tenantId, runId, eventTypes, after, before, cursor, limit } =
      parsed.data;

    const filter: SearchEventsFilter = {
      query: q,
    };
    if (tenantId) filter.tenantId = tenantId;
    if (runId) filter.runId = runId;
    if (eventTypes) filter.eventTypes = eventTypes;
    if (after) filter.after = new Date(after);
    if (before) filter.before = new Date(before);

    const page: SearchEventsPage = {};
    if (cursor) page.cursor = cursor;
    if (limit !== undefined) page.limit = limit;

    try {
      const result = await searchEvents(filter, page);

      return reply.status(200).send({
        data: result.events.map(formatSearchEventResponse),
        meta: {
          requestId: request.id,
          nextCursor: result.nextCursor,
          count: result.events.length,
          totalEstimate: result.totalEstimate,
          query: q,
        },
      });
    } catch (err) {
      request.log.error({ err, query: q }, 'Failed to search events');
      return reply.status(500).send({
        error: {
          code: 'SEARCH_FAILED',
          message: 'Internal error while searching events',
          requestId: request.id,
        },
      });
    }
  });
}
