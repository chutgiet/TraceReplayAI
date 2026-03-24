import Fastify from 'fastify';
import { closePool } from '@tracereplay/common';
import type { ConnectionOptions } from 'bullmq';
import { ingestRoutes } from './routes/ingest.js';
import { rawEventsRoutes } from './routes/raw-events.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const REDIS_HOST = process.env['REDIS_HOST'] ?? 'localhost';
const REDIS_PORT = Number(process.env['REDIS_PORT'] ?? 6379);
const REDIS_PASSWORD = process.env['REDIS_PASSWORD'];

function getRedisConnection(): ConnectionOptions {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  };
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Health check
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Register routes
  await app.register(ingestRoutes, { prefix: '/v1' });
  await app.register(rawEventsRoutes, { prefix: '/v1', redis: getRedisConnection() });

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async () => {
    app.log.info('Shutting down…');
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: PORT, host: HOST });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start ingest-api', err);
  process.exit(1);
});
