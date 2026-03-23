import Fastify from 'fastify';
import { closePool } from '@tracereplay/common';
import { runsRoutes } from './routes/runs.js';
import { eventsRoutes } from './routes/events.js';
import { timelineRoutes } from './routes/timeline.js';
import { searchRoutes } from './routes/search.js';

const PORT = Number(process.env['PORT'] ?? 3002);
const HOST = process.env['HOST'] ?? '0.0.0.0';

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
  await app.register(runsRoutes, { prefix: '/v1' });
  await app.register(eventsRoutes, { prefix: '/v1' });
  await app.register(timelineRoutes, { prefix: '/v1' });
  await app.register(searchRoutes, { prefix: '/v1' });

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
  console.error('Failed to start query-service', err);
  process.exit(1);
});
