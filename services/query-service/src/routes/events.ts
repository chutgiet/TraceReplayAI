import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRunById, getEventsByRunId, getEventById } from '@tracereplay/common';
import type { EventRow } from '@tracereplay/common';
import { RedactionEngine, BUILT_IN_RULES } from '@tracereplay/redaction';
import type { RedactionRule, RedactionRecord } from '@tracereplay/redaction';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const runIdParamSchema = z.object({
  runId: z.string().uuid(),
});

const eventIdParamSchema = z.object({
  eventId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Redaction engine (singleton per process)
// ---------------------------------------------------------------------------

function loadRedactionRules(): readonly RedactionRule[] {
  const rulesJson = process.env['REDACTION_RULES'];
  if (!rulesJson) return BUILT_IN_RULES;

  try {
    const parsed = JSON.parse(rulesJson) as RedactionRule[];
    return [...BUILT_IN_RULES, ...parsed];
  } catch {
    // If env var is malformed, fall back to built-in rules only
    return BUILT_IN_RULES;
  }
}

const redactionEnabled = process.env['REDACTION_ENABLED'] !== 'false';
const redactionEngine = new RedactionEngine(redactionEnabled ? loadRedactionRules() : []);

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

/**
 * Format an event with redaction applied to the payload.
 * Returns the formatted event plus a list of which fields were redacted.
 */
function formatEventWithRedaction(
  event: EventRow,
): { formatted: Record<string, unknown>; redactedFields: RedactionRecord[] } {
  const { redactedPayload, redactedFields } = redactionEngine.redact(event.payload);

  const formatted: Record<string, unknown> = {
    id: event.id,
    runId: event.run_id,
    tenantId: event.tenant_id,
    type: event.type,
    sequence: event.sequence,
    parentEventId: event.parent_event_id,
    sourceAgent: event.source_agent,
    sourceFramework: event.source_framework,
    payload: redactedPayload,
    rawMeta: event.raw_meta,
    tags: event.tags,
    schemaVersion: event.schema_version,
    timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
    receivedAt: event.received_at instanceof Date ? event.received_at.toISOString() : event.received_at,
  };

  return { formatted, redactedFields };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------------------
  // GET /v1/events/:eventId — get a single event with redaction applied
  // -----------------------------------------------------------------------
  app.get('/events/:eventId', async (request, reply) => {
    const paramParsed = eventIdParamSchema.safeParse(request.params);

    if (!paramParsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_EVENT_ID',
          message: 'eventId must be a valid UUID',
          details: paramParsed.error.issues,
          requestId: request.id,
        },
      });
    }

    const { eventId } = paramParsed.data;

    try {
      const event = await getEventById(eventId);

      if (!event) {
        return reply.status(404).send({
          error: {
            code: 'EVENT_NOT_FOUND',
            message: `Event ${eventId} not found`,
            requestId: request.id,
          },
        });
      }

      const { formatted, redactedFields } = formatEventWithRedaction(event);

      return reply.status(200).send({
        data: {
          ...formatted,
          redactedFields: redactedFields.map((r) => ({
            fieldPath: r.fieldPath,
            ruleId: r.ruleId,
            action: r.action,
          })),
        },
        meta: {
          requestId: request.id,
          redactionApplied: redactedFields.length > 0,
        },
      });
    } catch (err) {
      request.log.error({ err, eventId }, 'Failed to get event');
      return reply.status(500).send({
        error: {
          code: 'QUERY_FAILED',
          message: 'Internal error while querying event',
          requestId: request.id,
        },
      });
    }
  });

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
