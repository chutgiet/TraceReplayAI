import type { ConnectionOptions } from 'bullmq';

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

export interface OllamaProcessorConfig {
  /** Fastify HTTP server port. */
  port: number;

  /** Fastify HTTP server host. */
  host: string;

  /** BullMQ Redis connection options. */
  redis: ConnectionOptions;

  /** Log level for Fastify. */
  logLevel: string;

  /** Max concurrent Ollama processing jobs. */
  concurrency: number;

  /** Ollama API base URL. */
  ollamaBaseUrl: string;

  /** Ollama model to use for processing. */
  ollamaModel: string;

  /** Timeout for Ollama API calls in milliseconds. */
  ollamaTimeoutMs: number;

  /** Database connection URL. */
  databaseUrl: string;
}

export function loadConfig(): OllamaProcessorConfig {
  const redisHost = process.env['REDIS_HOST'] ?? 'localhost';
  const redisPort = Number(process.env['REDIS_PORT'] ?? 6379);
  const redisPassword = process.env['REDIS_PASSWORD'];

  const redis: ConnectionOptions = {
    host: redisHost,
    port: redisPort,
    ...(redisPassword ? { password: redisPassword } : {}),
  };

  return {
    port: Number(process.env['PORT'] ?? 3007),
    host: process.env['HOST'] ?? '0.0.0.0',
    redis,
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
    concurrency: Number(process.env['OLLAMA_PROCESSOR_CONCURRENCY'] ?? 3),
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
    ollamaModel: process.env['OLLAMA_MODEL'] ?? 'deepseek-r1:14b',
    ollamaTimeoutMs: Number(process.env['OLLAMA_TIMEOUT_MS'] ?? 30000),
    databaseUrl:
      process.env['DATABASE_URL'] ??
      'postgresql://tracereplay:tracereplay@localhost:5432/tracereplay',
  };
}
