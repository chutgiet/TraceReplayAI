import type { ConnectionOptions } from 'bullmq';
import type { WorkerConfig } from './types.js';

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

export function loadConfig(): WorkerConfig {
  const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
  const redisPort = Number(process.env['REDIS_PORT'] ?? 6379);
  const redisPassword = process.env['REDIS_PASSWORD'];

  const redis: ConnectionOptions = {
    host: redisHost,
    port: redisPort,
    ...(redisPassword ? { password: redisPassword } : {}),
  };

  return {
    port: Number(process.env['PORT'] ?? 3004),
    host: process.env['HOST'] ?? '0.0.0.0',
    redis,
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    normalizationConcurrency: Number(
      process.env['WORKER_NORMALIZATION_CONCURRENCY'] ?? 5,
    ),
  };
}
