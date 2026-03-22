import Fastify from 'fastify';
import { closePool, insertEvent } from '@tracereplay/common';
import type { InsertEventRow } from '@tracereplay/common';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import { loadConfig } from './config.js';
import { NormalizationWorker } from './queues/normalization.js';
import { QueueManager } from './queues/queue-manager.js';

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
// App builder — exported for testing
// ---------------------------------------------------------------------------

export interface BuildAppOptions {
  /** Override config for testing. */
  config?: ReturnType<typeof loadConfig>;

  /** Override the queue manager for testing. */
  queueManager?: QueueManager;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // -----------------------------------------------------------------------
  // Queue manager setup
  // -----------------------------------------------------------------------

  const queueManager = options.queueManager ?? new QueueManager();

  // Register normalization worker (unless a custom queueManager was provided)
  if (!options.queueManager) {
    const normalizationWorker = new NormalizationWorker({
      connection: config.redis,
      concurrency: config.normalizationConcurrency,
      onPersist: async (events, jobId) => {
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
    });

    queueManager.register(normalizationWorker);
  }

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  app.get('/healthz', async () => {
    const workers = queueManager.getWorkers().map((w) => ({
      name: w.name,
      queue: w.queueName,
    }));

    return {
      status: queueManager.isRunning() ? 'ok' : 'starting',
      service: 'worker',
      workers,
    };
  });

  // -----------------------------------------------------------------------
  // Stats endpoint
  // -----------------------------------------------------------------------

  app.get('/stats', async () => ({
    data: {
      queues: queueManager.getAllStats(),
      running: queueManager.isRunning(),
    },
  }));

  // -----------------------------------------------------------------------
  // Lifecycle hooks
  // -----------------------------------------------------------------------

  app.addHook('onReady', async () => {
    await queueManager.start();
    app.log.info(
      { workers: queueManager.getWorkers().map((w) => w.name) },
      'All queue workers started',
    );
  });

  app.addHook('onClose', async () => {
    await queueManager.stop();
    await closePool();
    app.log.info('All queue workers stopped');
  });

  return app;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  const shutdown = async () => {
    app.log.info('Shutting down worker service…');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start worker service', err);
  process.exit(1);
});
