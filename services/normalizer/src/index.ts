import Fastify from 'fastify';
import { closePool, getPool, insertEvent, updateRunStatus } from '@tracereplay/common';
import type { InsertEventRow, RunStatus } from '@tracereplay/common';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { ConnectionOptions } from 'bullmq';
import {
  NormalizationProcessor,
  NORMALIZATION_QUEUE,
  DEAD_LETTER_QUEUE,
} from './queues/normalization-processor.js';

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const PORT = Number(process.env['PORT'] ?? 3003);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = Number(process.env['REDIS_PORT'] ?? 6379);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];
const WORKER_CONCURRENCY = Number(process.env['WORKER_CONCURRENCY'] ?? 5);

function getRedisConnection(): ConnectionOptions {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  };
}

// ---------------------------------------------------------------------------
// Canonical event → DB row mapping
// ---------------------------------------------------------------------------

function toInsertEventRow(event: TraceReplayEvent): InsertEventRow {
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

// ---------------------------------------------------------------------------
// Ensure the run row exists before inserting events (mirrors ingest-service)
// ---------------------------------------------------------------------------

async function ensureRun(event: TraceReplayEvent): Promise<void> {
  const pool = getPool();

  if (event.type === 'run.start') {
    // For run.start, upsert with metadata in a single statement
    const payload = event.payload as {
      runName?: string;
      triggerSource?: string;
      parentRunId?: string;
      configuration?: Record<string, unknown>;
    };
    await pool.query(
      `INSERT INTO runs (id, tenant_id, agent_id, run_name, trigger_source, parent_run_id, status, started_at, metadata, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, 'running', $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         run_name = COALESCE(EXCLUDED.run_name, runs.run_name),
         trigger_source = COALESCE(EXCLUDED.trigger_source, runs.trigger_source),
         parent_run_id = COALESCE(EXCLUDED.parent_run_id, runs.parent_run_id),
         metadata = COALESCE(EXCLUDED.metadata, runs.metadata),
         updated_at = NOW()`,
      [
        event.runId,
        event.tenantId,
        event.sourceAgent,
        payload.runName ?? null,
        payload.triggerSource ?? null,
        payload.parentRunId ?? null,
        new Date(event.timestamp),
        payload.configuration ? JSON.stringify(payload.configuration) : null,
        event.schemaVersion,
      ],
    );
  } else {
    // For other events, just ensure the run row exists
    await pool.query(
      `INSERT INTO runs (id, tenant_id, agent_id, status, started_at, schema_version)
       VALUES ($1, $2, $3, 'running', $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [event.runId, event.tenantId, event.sourceAgent, new Date(event.timestamp), event.schemaVersion],
    );
  }
}

// ---------------------------------------------------------------------------
// Server + worker setup
// ---------------------------------------------------------------------------

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  const connection = getRedisConnection();

  const processor = new NormalizationProcessor(
    {
      connection,
      concurrency: WORKER_CONCURRENCY,
      onNormalized: async (events, jobId) => {
        for (const event of events) {
          try {
            await ensureRun(event);
            await insertEvent(toInsertEventRow(event));

            // Update run status on lifecycle events
            if (event.type === 'run.end') {
              const status = (event.payload as { status?: string }).status as RunStatus | undefined;
              if (status) {
                await updateRunStatus(event.runId, status, new Date(event.timestamp));
              }
            } else if (event.type === 'run.error') {
              const fatal = (event.payload as { fatal?: boolean }).fatal;
              if (fatal) {
                await updateRunStatus(event.runId, 'failure', null);
              }
            }
          } catch (err) {
            app.log.error(
              { err, eventId: event.id, runId: event.runId, jobId },
              'Failed to persist normalized event',
            );
            throw err; // Re-throw so BullMQ retries the job
          }
        }
        app.log.info(
          { jobId, eventCount: events.length },
          'Normalized and persisted events',
        );
      },
      onDeadLetter: async (raw, reason, jobId) => {
        app.log.warn(
          { jobId, vendor: raw.vendor, reason },
          'Event sent to dead-letter queue',
        );
      },
    },
  );

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'normalizer',
    queues: {
      normalization: NORMALIZATION_QUEUE,
      deadLetter: DEAD_LETTER_QUEUE,
    },
  }));

  // -----------------------------------------------------------------------
  // Stats endpoint
  // -----------------------------------------------------------------------
  app.get('/stats', async () => ({
    data: processor.getStats(),
  }));

  // -----------------------------------------------------------------------
  // Lifecycle hooks
  // -----------------------------------------------------------------------
  app.addHook('onReady', async () => {
    await processor.start();
    app.log.info('Normalization worker started');
  });

  app.addHook('onClose', async () => {
    await processor.stop();
    await closePool();
    app.log.info('Normalization worker stopped');
  });

  return app;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async () => {
    app.log.info('Shutting down normalizer…');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: PORT, host: HOST });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start normalizer', err);
  process.exit(1);
});
