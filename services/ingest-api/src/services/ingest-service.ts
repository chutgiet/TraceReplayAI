import type { Pool } from 'pg';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import {
  getPool,
  insertRun,
  getRunById,
  withTransaction,
} from '@tracereplay/common';
import type { InsertRunRow, InsertEventRow, RunStatus } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestResult {
  eventId: string;
  status: 'created' | 'duplicate';
}

// ---------------------------------------------------------------------------
// Single event ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a validated canonical event:
 * 1. Ensure the parent run exists (create on run.start, auto-create otherwise)
 * 2. Insert the event row (idempotent — duplicate IDs return 'duplicate')
 * 3. If run.end / run.error, update the run's status
 */
export async function ingestEvent(
  event: TraceReplayEvent,
  pool: Pool = getPool(),
): Promise<IngestResult> {
  return withTransaction(async (client) => {
    // Idempotent: check for duplicate event
    const dupCheck = await client.query(
      'SELECT id FROM events WHERE id = $1',
      [event.id],
    );
    if (dupCheck.rows.length > 0) {
      return { eventId: event.id, status: 'duplicate' as const };
    }

    // Ensure the run row exists
    await ensureRun(event, pool);

    // Persist the event
    const eventRow = toEventRow(event);
    await client.query(
      `INSERT INTO events (
         id, run_id, tenant_id, type, sequence, parent_event_id,
         source_agent, source_framework, payload, raw_meta,
         tags, schema_version, "timestamp"
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13
       )`,
      [
        eventRow.id,
        eventRow.run_id,
        eventRow.tenant_id,
        eventRow.type,
        eventRow.sequence ?? null,
        eventRow.parent_event_id ?? null,
        eventRow.source_agent,
        eventRow.source_framework ?? null,
        JSON.stringify(eventRow.payload),
        eventRow.raw_meta ? JSON.stringify(eventRow.raw_meta) : null,
        eventRow.tags ?? [],
        eventRow.schema_version,
        eventRow.timestamp,
      ],
    );

    // Update run status on lifecycle events
    if (event.type === 'run.end') {
      const status = (event.payload as { status?: string }).status as RunStatus | undefined;
      if (status) {
        await client.query(
          `UPDATE runs SET status = $2, ended_at = $3, updated_at = NOW() WHERE id = $1`,
          [event.runId, status, new Date(event.timestamp)],
        );
      }
    } else if (event.type === 'run.error') {
      const fatal = (event.payload as { fatal?: boolean }).fatal;
      if (fatal) {
        await client.query(
          `UPDATE runs SET status = 'failure', updated_at = NOW() WHERE id = $1`,
          [event.runId],
        );
      }
    }

    return { eventId: event.id, status: 'created' as const };
  }, pool);
}

// ---------------------------------------------------------------------------
// Batch ingestion
// ---------------------------------------------------------------------------

export async function ingestEventBatch(
  events: TraceReplayEvent[],
  pool: Pool = getPool(),
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const event of events) {
    const result = await ingestEvent(event, pool);
    results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the run row exists for this event's runId.
 * - On run.start: create the row with metadata from the payload
 * - Otherwise: auto-create a minimal row so the FK constraint is satisfied
 */
async function ensureRun(event: TraceReplayEvent, pool: Pool): Promise<void> {
  const existing = await getRunById(event.runId, pool);
  if (existing) return;

  const runRow: InsertRunRow = {
    id: event.runId,
    tenant_id: event.tenantId,
    agent_id: event.sourceAgent,
    started_at: new Date(event.timestamp),
    schema_version: event.schemaVersion,
  };

  if (event.type === 'run.start') {
    const payload = event.payload as {
      runName?: string;
      triggerSource?: string;
      parentRunId?: string;
      configuration?: Record<string, unknown>;
    };
    runRow.run_name = payload.runName ?? null;
    runRow.trigger_source = payload.triggerSource ?? null;
    runRow.parent_run_id = payload.parentRunId ?? null;
    runRow.metadata = payload.configuration ?? null;
  }

  await insertRun(runRow, pool);
}

/** Map a validated TraceReplayEvent to the db InsertEventRow shape. */
function toEventRow(event: TraceReplayEvent): InsertEventRow {
  return {
    id: event.id,
    run_id: event.runId,
    tenant_id: event.tenantId,
    type: event.type,
    sequence: event.sequence ?? null,
    parent_event_id: event.parentEventId ?? null,
    source_agent: event.sourceAgent,
    source_framework: event.sourceFramework ?? null,
    payload: event.payload as Record<string, unknown>,
    raw_meta: event.rawMeta ?? null,
    tags: event.tags ?? [],
    schema_version: event.schemaVersion,
    timestamp: new Date(event.timestamp),
  };
}
