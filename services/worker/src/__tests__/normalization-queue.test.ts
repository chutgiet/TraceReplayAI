import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { RawVendorEvent } from '@tracereplay/connectors-core';
import { AdapterRegistry, PassthroughAdapter } from '@tracereplay/connectors-core';
import type { NormalizationJobData } from '../types.js';
import { QUEUE_NAMES } from '../types.js';
import { NormalizationWorker } from '../queues/normalization.js';

// ---------------------------------------------------------------------------
// Mock BullMQ — we don't want real Redis in unit tests
// ---------------------------------------------------------------------------

const mockWorkerOn = vi.fn();
const mockWorkerClose = vi.fn().mockResolvedValue(undefined);
const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);

let capturedWorkerProcessor: ((job: { data: NormalizationJobData }) => Promise<void>) | null = null;

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: { data: NormalizationJobData }) => Promise<void>) => {
    capturedWorkerProcessor = processor;
    return {
      on: mockWorkerOn,
      close: mockWorkerClose,
    };
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePassthroughRaw(): RawVendorEvent {
  return {
    vendor: 'tracereplay',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    data: {
      id: 'a0000001-0000-4000-8000-000000000001',
      runId: 'b0000001-0000-4000-8000-000000000001',
      type: 'run.start',
      timestamp: '2026-03-15T10:00:00.000Z',
      tenantId: 'tenant-test-001',
      sourceAgent: 'test-agent',
      payload: { runName: 'test-run', triggerSource: 'user' },
      schemaVersion: SCHEMA_VERSION,
    },
  };
}

function makeOpenAIRaw(): RawVendorEvent {
  return {
    vendor: 'openai-agents',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    runId: 'b0000001-0000-4000-8000-000000000001',
    data: {
      type: 'agent.start',
      trace_id: 'trace-001',
      span_id: 'a0000001-0000-4000-8000-000000000099',
      timestamp: '2026-03-15T10:00:00.000Z',
      agent_name: 'test-openai-agent',
      data: { name: 'my-agent' },
    },
  };
}

function makeUnknownVendorRaw(): RawVendorEvent {
  return {
    vendor: 'unknown-vendor',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    data: { type: 'something', data: {} },
  };
}

function makeJob(rawEvent: RawVendorEvent, jobId = 'job-001'): { data: NormalizationJobData } {
  return {
    data: {
      jobId,
      rawEvent,
      attemptNumber: 1,
    },
  };
}

const CONNECTION = { host: 'localhost', port: 6379 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NormalizationWorker', () => {
  let onPersist: ReturnType<typeof vi.fn>;
  let onDeadLetter: ReturnType<typeof vi.fn>;
  let worker: NormalizationWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedWorkerProcessor = null;
    onPersist = vi.fn().mockResolvedValue(undefined);
    onDeadLetter = vi.fn().mockResolvedValue(undefined);

    worker = new NormalizationWorker({
      connection: CONNECTION,
      concurrency: 3,
      onPersist,
      onDeadLetter,
    });
  });

  afterEach(async () => {
    await worker.stop();
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('lifecycle', () => {
    it('sets correct name and queueName', () => {
      expect(worker.name).toBe('normalization-worker');
      expect(worker.queueName).toBe(QUEUE_NAMES.NORMALIZATION);
    });

    it('is not running before start', () => {
      expect(worker.isRunning()).toBe(false);
    });

    it('starts the BullMQ worker', async () => {
      await worker.start();
      const { Worker } = await import('bullmq');
      expect(Worker).toHaveBeenCalledWith(
        QUEUE_NAMES.NORMALIZATION,
        expect.any(Function),
        expect.objectContaining({
          connection: CONNECTION,
          concurrency: 3,
        }),
      );
      expect(worker.isRunning()).toBe(true);
    });

    it('registers an error handler on the worker', async () => {
      await worker.start();
      expect(mockWorkerOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('is idempotent — calling start twice does not create two workers', async () => {
      const { Worker } = await import('bullmq');
      await worker.start();
      await worker.start();
      expect(Worker).toHaveBeenCalledTimes(1);
    });

    it('stops the worker and closes dead-letter queue', async () => {
      await worker.start();
      await worker.stop();
      expect(mockWorkerClose).toHaveBeenCalledOnce();
      expect(mockQueueClose).toHaveBeenCalledOnce();
      expect(worker.isRunning()).toBe(false);
    });

    it('stop is safe when not started', async () => {
      await worker.stop(); // Should not throw
      expect(mockWorkerClose).not.toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalledOnce(); // DLQ queue always cleaned up
    });
  });

  // -----------------------------------------------------------------------
  // Job processing — passthrough events
  // -----------------------------------------------------------------------

  describe('job processing — passthrough events', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('normalizes a passthrough event and calls onPersist', async () => {
      const job = makeJob(makePassthroughRaw());
      await capturedWorkerProcessor!(job);

      expect(onPersist).toHaveBeenCalledOnce();
      const [events, jobId] = onPersist.mock.calls[0]!;
      expect(events).toHaveLength(1);
      expect((events as TraceReplayEvent[])[0]!.type).toBe('run.start');
      expect(jobId).toBe('job-001');
    });

    it('increments succeeded stats on successful normalization', async () => {
      await capturedWorkerProcessor!(makeJob(makePassthroughRaw()));

      const stats = worker.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.deadLettered).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Job processing — OpenAI events
  // -----------------------------------------------------------------------

  describe('job processing — OpenAI events', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('normalizes an OpenAI Agents event', async () => {
      await capturedWorkerProcessor!(makeJob(makeOpenAIRaw()));

      expect(onPersist).toHaveBeenCalledOnce();
      const [events] = onPersist.mock.calls[0]!;
      expect(events).toHaveLength(1);
      expect((events as TraceReplayEvent[])[0]!.sourceFramework).toBe('openai-agents');
    });
  });

  // -----------------------------------------------------------------------
  // Job processing — dead-letter
  // -----------------------------------------------------------------------

  describe('job processing — dead-letter handling', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('dead-letters events from unknown vendors', async () => {
      await capturedWorkerProcessor!(makeJob(makeUnknownVendorRaw(), 'job-dlq'));

      expect(onPersist).not.toHaveBeenCalled();
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'dead-letter',
        expect.objectContaining({
          originalJobId: 'job-dlq',
          reason: expect.stringContaining('No adapter found'),
        }),
      );
      expect(onDeadLetter).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: 'unknown-vendor' }),
        expect.stringContaining('No adapter found'),
        'job-dlq',
      );
    });

    it('increments failed and deadLettered stats on dead-letter', async () => {
      await capturedWorkerProcessor!(makeJob(makeUnknownVendorRaw()));

      const stats = worker.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.deadLettered).toBe(1);
    });

    it('works without onDeadLetter callback', async () => {
      const workerNoCallback = new NormalizationWorker({
        connection: CONNECTION,
        concurrency: 1,
        onPersist,
        // no onDeadLetter
      });
      await workerNoCallback.start();

      // Should not throw
      await capturedWorkerProcessor!(makeJob(makeUnknownVendorRaw()));

      expect(mockQueueAdd).toHaveBeenCalled(); // Still enqueues to DLQ
      await workerNoCallback.stop();
    });
  });

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  describe('stats', () => {
    beforeEach(async () => {
      await worker.start();
    });

    it('starts at zero', () => {
      const stats = worker.getStats();
      expect(stats.processed).toBe(0);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.deadLettered).toBe(0);
    });

    it('tracks multiple operations correctly', async () => {
      await capturedWorkerProcessor!(makeJob(makePassthroughRaw(), 'j1'));
      await capturedWorkerProcessor!(makeJob(makeOpenAIRaw(), 'j2'));
      await capturedWorkerProcessor!(makeJob(makeUnknownVendorRaw(), 'j3'));
      await capturedWorkerProcessor!(makeJob(makePassthroughRaw(), 'j4'));

      const stats = worker.getStats();
      expect(stats.processed).toBe(4);
      expect(stats.succeeded).toBe(3);
      expect(stats.failed).toBe(1);
      expect(stats.deadLettered).toBe(1);
    });

    it('returns a snapshot (not a live reference)', async () => {
      const snap1 = worker.getStats();
      await capturedWorkerProcessor!(makeJob(makePassthroughRaw()));
      const snap2 = worker.getStats();

      expect(snap1.processed).toBe(0);
      expect(snap2.processed).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Default adapter registry
  // -----------------------------------------------------------------------

  describe('createDefaultRegistry', () => {
    it('includes all built-in adapters', () => {
      const registry = NormalizationWorker.createDefaultRegistry();
      expect(registry.vendorIds()).toContain('tracereplay');
      expect(registry.vendorIds()).toContain('openai-agents');
      expect(registry.vendorIds()).toContain('github-copilot');
      expect(registry.vendorIds()).toContain('claude-code');
    });
  });

  // -----------------------------------------------------------------------
  // Custom adapter registry
  // -----------------------------------------------------------------------

  describe('custom registry', () => {
    it('accepts a custom adapter registry', async () => {
      const customRegistry = new AdapterRegistry();
      customRegistry.register(new PassthroughAdapter());

      const customWorker = new NormalizationWorker({
        connection: CONNECTION,
        concurrency: 1,
        onPersist,
        registry: customRegistry,
      });

      expect(customWorker.getRegistry().vendorIds()).toEqual(['tracereplay']);
      await customWorker.stop();
    });
  });
});
