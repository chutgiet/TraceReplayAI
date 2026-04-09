import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Service integration tests (Fastify app with mocked worker)
// ---------------------------------------------------------------------------

// Mock external dependencies
vi.mock('@tracereplay/common', () => ({
  closePool: vi.fn().mockResolvedValue(undefined),
  insertEvent: vi.fn().mockResolvedValue({ id: 'test' }),
  getEventsByRunId: vi.fn().mockResolvedValue([]),
}));

describe('ollama-processor service', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    const mockWorker = {
      name: 'ollama-processing-worker',
      queueName: 'ollama-processing',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({
        processed: 5,
        succeeded: 4,
        failed: 1,
        deadLettered: 0,
        ollamaUnavailable: 0,
      }),
      isRunning: vi.fn().mockReturnValue(true),
    };

    app = await buildApp({
      config: {
        port: 0,
        host: '127.0.0.1',
        redis: { host: 'localhost', port: 6379 },
        logLevel: 'silent',
        concurrency: 1,
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'deepseek-r1:14b',
        ollamaTimeoutMs: 5000,
        databaseUrl: 'postgresql://test:test@localhost:5432/test',
      },
      worker: mockWorker as never,
    });

    await app.ready();
  });

  it('GET /healthz returns service status', async () => {
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('ollama-processor');
    expect(body.ollamaModel).toBe('deepseek-r1:14b');
  });

  it('GET /stats returns processing stats', async () => {
    const response = await app.inject({ method: 'GET', url: '/stats' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.data.stats.processed).toBe(5);
    expect(body.data.stats.succeeded).toBe(4);
    expect(body.data.running).toBe(true);
    expect(body.data.model).toBe('deepseek-r1:14b');
  });
});
