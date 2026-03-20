import Fastify from 'fastify';
import { closePool, insertEvent } from '@tracereplay/common';
import type { InsertEventRow } from '@tracereplay/common';
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
            await insertEvent(toInsertEventRow(event));
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
