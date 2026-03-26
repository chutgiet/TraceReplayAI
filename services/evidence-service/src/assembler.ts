import type { Pool } from 'pg';
import type {
  TraceReplayEvent,
  EventId,
  RunId,
  TenantId,
  EventType,
} from '@tracereplay/event-schema';
import type { EventRow, RunRow } from '@tracereplay/common';
import {
  getRunById,
  getEventsByRunId,
  getChildRunsByParentId,
} from '@tracereplay/common';
import { buildTimeline } from '@tracereplay/replay-engine';
import type { ReplayTimeline } from '@tracereplay/replay-engine';
import { buildLineageGraph, serializeGraph, resetEdgeCounter } from '@tracereplay/graph-model';
import type { SerializedLineageGraph } from '@tracereplay/graph-model';
import { RedactionEngine, BUILT_IN_RULES } from '@tracereplay/redaction';

import type {
  BundleId,
  EvidenceBundle,
  AssembleBundleRequest,
  AssembleBundleResult,
  RunMetadataSnapshot,
  RedactionAudit,
  EventRedactionEntry,
} from './types.js';
import { BUNDLE_SCHEMA_VERSION } from './types.js';
import {
  insertBundle,
  updateBundleStatus,
} from './repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a DB EventRow to a canonical TraceReplayEvent. */
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

/** Snapshot run metadata for the bundle. */
function snapshotRunMetadata(run: RunRow): RunMetadataSnapshot {
  return {
    runId: run.id,
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
  };
}

/** Determine if a run is still in progress (no terminal status). */
function isRunInProgress(run: RunRow): boolean {
  return run.status === 'running';
}

/** Build the redaction audit trail by re-running the redaction engine on each event payload. */
function buildRedactionAudit(events: TraceReplayEvent[]): RedactionAudit {
  const engine = new RedactionEngine(BUILT_IN_RULES);
  const eventRedactions: EventRedactionEntry[] = [];
  let totalRedactedFields = 0;

  for (const event of events) {
    const result = engine.redact(event.payload as Record<string, unknown>);

    if (result.redactedFields.length > 0) {
      eventRedactions.push({
        eventId: event.id,
        redactedFields: result.redactedFields,
      });
      totalRedactedFields += result.redactedFields.length;
    }
  }

  return { totalRedactedFields, eventRedactions };
}

// ---------------------------------------------------------------------------
// EvidenceBundleAssembler
// ---------------------------------------------------------------------------

/**
 * Assembles evidence bundles from run data.
 *
 * Queries the database for run metadata, events, and child runs,
 * then uses the replay engine and graph model to construct a
 * complete audit-ready bundle.
 */
export class EvidenceBundleAssembler {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Assemble a complete evidence bundle for the given run.
   *
   * Steps:
   * 1. Create a pending bundle row in the DB
   * 2. Fetch run metadata, events, and child runs
   * 3. Build replay timeline
   * 4. Build lineage graph
   * 5. Compute redaction audit trail
   * 6. Assemble the final bundle
   * 7. Update DB row with complete bundle or error
   */
  async assemble(request: AssembleBundleRequest): Promise<AssembleBundleResult> {
    const bundleId = crypto.randomUUID() as BundleId;
    const now = new Date().toISOString();

    // Step 1: Create pending bundle row
    await insertBundle(
      {
        id: bundleId,
        run_id: request.runId,
        tenant_id: request.tenantId,
        status: 'pending',
        bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      },
      this.pool,
    );

    try {
      // Update to assembling
      await updateBundleStatus(bundleId, 'assembling', null, null, this.pool);

      // Step 2: Fetch run data
      const run = await getRunById(request.runId, this.pool);
      if (!run) {
        throw new AssemblyError(`Run ${request.runId} not found`, 'RUN_NOT_FOUND');
      }

      // Validate tenant ownership
      if (run.tenant_id !== request.tenantId) {
        throw new AssemblyError(
          `Run ${request.runId} does not belong to tenant ${request.tenantId}`,
          'TENANT_MISMATCH',
        );
      }

      const [eventRows, childRuns] = await Promise.all([
        getEventsByRunId(request.runId, this.pool),
        getChildRunsByParentId(request.runId, this.pool),
      ]);

      const events = eventRows.map(toCanonicalEvent);
      const isPartial = isRunInProgress(run);

      // Step 3: Build replay timeline
      let timeline: ReplayTimeline | null = null;
      if (events.length > 0) {
        timeline = buildTimeline(events);
      }

      // Step 4: Build lineage graph
      let lineageGraph: SerializedLineageGraph | null = null;
      if (events.length > 0) {
        // Collect child run events for delegation edges
        const relatedEvents: TraceReplayEvent[] = [];
        for (const childRun of childRuns) {
          const childEventRows = await getEventsByRunId(childRun.id, this.pool);
          relatedEvents.push(...childEventRows.map(toCanonicalEvent));
        }

        resetEdgeCounter();
        const graph = buildLineageGraph(events, {
          includeTemporal: true,
          includeDataFlow: true,
          relatedRunEvents: relatedEvents.length > 0 ? relatedEvents : undefined,
        });
        lineageGraph = serializeGraph(graph);
      }

      // Step 5: Build redaction audit
      const redactionAudit = buildRedactionAudit(events);

      // Step 6: Assemble the bundle
      const bundle: EvidenceBundle = {
        id: bundleId,
        runId: request.runId,
        tenantId: request.tenantId,
        status: 'complete',
        createdAt: now,
        completedAt: new Date().toISOString(),
        runMetadata: snapshotRunMetadata(run),
        events,
        timeline,
        lineageGraph,
        redactionAudit,
        isPartialRun: isPartial,
        partialRunMarker: isPartial
          ? `Run ${request.runId} was still in progress (status: ${run.status}) at assembly time ${now}`
          : null,
        errorMessage: null,
        bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
      };

      // Step 7: Persist the complete bundle
      await updateBundleStatus(bundleId, 'complete', bundle, null, this.pool);

      return { bundle };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Persist the failure
      const failedBundle: EvidenceBundle = {
        id: bundleId,
        runId: request.runId,
        tenantId: request.tenantId,
        status: 'failed',
        createdAt: now,
        completedAt: null,
        runMetadata: null,
        events: [],
        timeline: null,
        lineageGraph: null,
        redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
        isPartialRun: false,
        partialRunMarker: null,
        errorMessage: message,
        bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
      };

      await updateBundleStatus(bundleId, 'failed', failedBundle, message, this.pool).catch(() => {
        // Best-effort; the original error is more important
      });

      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Domain error for evidence assembly failures. */
export class AssemblyError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AssemblyError';
    this.code = code;
  }
}
