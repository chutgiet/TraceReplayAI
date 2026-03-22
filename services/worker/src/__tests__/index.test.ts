import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueueWorker, NormalizationStats } from '../types.js';
import { QueueManager } from '../queues/queue-manager.js';
import { buildApp } from '../index.js';

// ---------------------------------------------------------------------------
// Mock external dependencies so no real Redis/DB connections are needed
// ---------------------------------------------------------------------------

vi.mock('@tracereplay/common', () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ---------------------------------------------------------------------------
// Mock worker factory
// ---------------------------------------------------------------------------

function createMockWorker(name: string, queueName: string): QueueWorker {
  const stats: NormalizationStats = {
    processed: 10,
    succeeded: 8,
    failed: 2,
    deadLettered: 1,
  };

  return {
    name,
    queueName,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStats: () => ({ ...stats }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Worker service HTTP endpoints', () => {
  describe('with custom QueueManager (mocked workers)', () => {
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeEach(async () => {
      const queueManager = new QueueManager();
      queueManager.register(createMockWorker('normalization-worker', 'normalization'));

      app = await buildApp({ queueManager });
    });

    // ---------------------------------------------------------------------
    // Health check
    // ---------------------------------------------------------------------

    describe('GET /healthz', () => {
      it('returns ok status when running', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/healthz',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.status).toBe('ok');
        expect(body.service).toBe('worker');
        expect(body.workers).toHaveLength(1);
        expect(body.workers[0]).toEqual({
          name: 'normalization-worker',
          queue: 'normalization',
        });
      });
    });

    // ---------------------------------------------------------------------
    // Stats endpoint
    // ---------------------------------------------------------------------

    describe('GET /stats', () => {
      it('returns queue stats', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/stats',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.running).toBe(true);
        expect(body.data.queues).toHaveProperty('normalization');
        expect(body.data.queues.normalization.processed).toBe(10);
        expect(body.data.queues.normalization.succeeded).toBe(8);
        expect(body.data.queues.normalization.failed).toBe(2);
        expect(body.data.queues.normalization.deadLettered).toBe(1);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Default build (no custom queue manager)
  // -----------------------------------------------------------------------

  describe('default build', () => {
    it('builds the app with default normalization worker', async () => {
      const app = await buildApp({
        config: {
          port: 3099,
          host: '127.0.0.1',
          redis: { host: 'localhost', port: 6379 },
          logLevel: 'silent',
          normalizationConcurrency: 2,
        },
      });

      const healthResponse = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(healthResponse.statusCode).toBe(200);
      const body = healthResponse.json();
      expect(body.service).toBe('worker');
      expect(body.workers).toHaveLength(1);
      expect(body.workers[0].name).toBe('normalization-worker');

      await app.close();
    });
  });
});

// ---------------------------------------------------------------------------
// Config tests
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('loads default config when no env vars set', async () => {
    const { loadConfig } = await import('../config.js');
    const config = loadConfig();

    expect(config.port).toBe(3004);
    expect(config.host).toBe('0.0.0.0');
    expect(config.redis).toEqual(
      expect.objectContaining({ host: 'localhost', port: 6379 }),
    );
    expect(config.logLevel).toBe('info');
    expect(config.normalizationConcurrency).toBe(5);
  });
});
