import Fastify from 'fastify';
import { closePool, insertEvent } from '@tracereplay/common';
import { loadConfig } from './config.js';
import type { OllamaProcessorConfig } from './config.js';
import { OllamaClient } from './client.js';
import { OllamaProcessingWorker } from './worker.js';

// ---------------------------------------------------------------------------
// App builder — exported for testing
// ---------------------------------------------------------------------------

export interface BuildAppOptions {
  config?: OllamaProcessorConfig;
  worker?: OllamaProcessingWorker;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: { level: config.logLevel },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // -----------------------------------------------------------------------
  // Ollama client
  // -----------------------------------------------------------------------

  const ollamaClient = new OllamaClient({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    timeoutMs: config.ollamaTimeoutMs,
  });

  // -----------------------------------------------------------------------
  // Worker setup
  // -----------------------------------------------------------------------

  const worker =
    options.worker ??
    new OllamaProcessingWorker({
      connection: config.redis,
      concurrency: config.concurrency,
      ollamaClient,
      onComplete: async (annotationEvents, jobId) => {
        for (const event of annotationEvents) {
          try {
            await insertEvent(event);
          } catch (err) {
            app.log.error(
              { err, eventId: event.id, runId: event.run_id, jobId },
              'Failed to persist annotation event',
            );
            throw err;
          }
        }
        app.log.info(
          { jobId, eventCount: annotationEvents.length },
          'Ollama annotation events persisted',
        );
      },
      onDeadLetter: async (jobData, reason, jobId) => {
        app.log.warn(
          { jobId, type: jobData.type, runId: jobData.runId, reason },
          'Ollama job sent to dead-letter queue',
        );
      },
    });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  app.get('/healthz', async () => {
    const ollamaAvailable = await ollamaClient.isAvailable();
    return {
      status: worker.isRunning() ? 'ok' : 'starting',
      service: 'ollama-processor',
      ollamaAvailable,
      ollamaModel: config.ollamaModel,
      ollamaBaseUrl: config.ollamaBaseUrl,
    };
  });

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  app.get('/stats', async () => ({
    data: {
      stats: worker.getStats(),
      running: worker.isRunning(),
      model: config.ollamaModel,
    },
  }));

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  app.addHook('onReady', async () => {
    await worker.start();
    const available = await ollamaClient.isAvailable();
    app.log.info(
      { ollamaAvailable: available, model: config.ollamaModel },
      'Ollama processing worker started',
    );
  });

  app.addHook('onClose', async () => {
    await worker.stop();
    await closePool();
    app.log.info('Ollama processing worker stopped');
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
    app.log.info('Shutting down ollama-processor service…');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: config.host });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start ollama-processor service', err);
  process.exit(1);
});
