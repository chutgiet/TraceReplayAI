import Fastify from 'fastify';
import { closePool } from '@tracereplay/common';
import { bundlesRoutes } from './routes/bundles.js';

const PORT = Number(process.env['PORT'] ?? 3006);
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
  await app.register(bundlesRoutes, { prefix: '/v1' });

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
  console.error('Failed to start evidence-service', err);
  process.exit(1);
});
