import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueueWorker, NormalizationStats } from '../types.js';
import { QueueManager } from '../queues/queue-manager.js';

// ---------------------------------------------------------------------------
// Mock queue worker factory
// ---------------------------------------------------------------------------

function createMockWorker(
  name: string,
  queueName: string,
  overrides: Partial<Record<'start' | 'stop', ReturnType<typeof vi.fn>>> = {},
): QueueWorker {
  const stats: NormalizationStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  return {
    name,
    queueName,
    start: overrides.start ?? vi.fn().mockResolvedValue(undefined),
    stop: overrides.stop ?? vi.fn().mockResolvedValue(undefined),
    getStats: () => ({ ...stats }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QueueManager', () => {
  let manager: QueueManager;

  beforeEach(() => {
    manager = new QueueManager();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('registers a worker', () => {
      const worker = createMockWorker('test', 'test-queue');
      manager.register(worker);

      expect(manager.getWorkers()).toHaveLength(1);
      expect(manager.getWorkers()[0]!.name).toBe('test');
    });

    it('registers multiple workers', () => {
      manager.register(createMockWorker('w1', 'q1'));
      manager.register(createMockWorker('w2', 'q2'));
      manager.register(createMockWorker('w3', 'q3'));

      expect(manager.getWorkers()).toHaveLength(3);
    });

    it('throws if registering after start', async () => {
      await manager.start();

      expect(() => manager.register(createMockWorker('late', 'late-q'))).toThrow(
        'Cannot register workers after QueueManager has started',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('is not running initially', () => {
      expect(manager.isRunning()).toBe(false);
    });

    it('starts all registered workers', async () => {
      const w1 = createMockWorker('w1', 'q1');
      const w2 = createMockWorker('w2', 'q2');
      manager.register(w1);
      manager.register(w2);

      await manager.start();

      expect(w1.start).toHaveBeenCalledOnce();
      expect(w2.start).toHaveBeenCalledOnce();
      expect(manager.isRunning()).toBe(true);
    });

    it('start is idempotent', async () => {
      const w1 = createMockWorker('w1', 'q1');
      manager.register(w1);

      await manager.start();
      await manager.start();

      expect(w1.start).toHaveBeenCalledOnce();
    });

    it('stops all workers in reverse order', async () => {
      const stopOrder: string[] = [];
      const w1 = createMockWorker('w1', 'q1', {
        stop: vi.fn(async () => { stopOrder.push('w1'); }),
      });
      const w2 = createMockWorker('w2', 'q2', {
        stop: vi.fn(async () => { stopOrder.push('w2'); }),
      });
      const w3 = createMockWorker('w3', 'q3', {
        stop: vi.fn(async () => { stopOrder.push('w3'); }),
      });

      manager.register(w1);
      manager.register(w2);
      manager.register(w3);
      await manager.start();

      await manager.stop();

      expect(stopOrder).toEqual(['w3', 'w2', 'w1']);
      expect(manager.isRunning()).toBe(false);
    });

    it('stop is idempotent', async () => {
      const w1 = createMockWorker('w1', 'q1');
      manager.register(w1);

      await manager.start();
      await manager.stop();
      await manager.stop();

      expect(w1.stop).toHaveBeenCalledOnce();
    });

    it('stop is safe when never started', async () => {
      manager.register(createMockWorker('w1', 'q1'));
      await manager.stop(); // Should not throw
      expect(manager.isRunning()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  describe('getAllStats', () => {
    it('returns empty object when no workers registered', () => {
      expect(manager.getAllStats()).toEqual({});
    });

    it('returns stats keyed by queue name', () => {
      manager.register(createMockWorker('w1', 'normalization'));
      manager.register(createMockWorker('w2', 'indexing'));

      const stats = manager.getAllStats();

      expect(stats).toHaveProperty('normalization');
      expect(stats).toHaveProperty('indexing');
      expect(stats['normalization']!.processed).toBe(0);
      expect(stats['indexing']!.processed).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getWorkers
  // -----------------------------------------------------------------------

  describe('getWorkers', () => {
    it('returns a readonly array', () => {
      manager.register(createMockWorker('w1', 'q1'));

      const workers = manager.getWorkers();
      expect(workers).toHaveLength(1);
      // The returned array should be the internal array (readonly view)
      expect(workers[0]!.name).toBe('w1');
    });

    it('returns empty when no workers registered', () => {
      expect(manager.getWorkers()).toHaveLength(0);
    });
  });
});
