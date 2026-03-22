import { Worker, Queue } from 'bullmq';
import type { Job, ConnectionOptions } from 'bullmq';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { RawVendorEvent } from '@tracereplay/connectors-core';
import {
  AdapterRegistry,
  PassthroughAdapter,
  OpenAIAgentsAdapter,
  GitHubCopilotAdapter,
  ClaudeCodeAdapter,
} from '@tracereplay/connectors-core';
import type {
  NormalizationJobData,
  DeadLetterEntry,
  NormalizationStats,
  QueueWorker,
} from '../types.js';
import { QUEUE_NAMES } from '../types.js';

// ---------------------------------------------------------------------------
// Event persistence callback type
// ---------------------------------------------------------------------------

/**
 * Callback to persist normalized canonical events.
 * Provided by the caller (index.ts) so the queue worker stays decoupled
 * from database internals.
 */
export type PersistEventsCallback = (
  events: TraceReplayEvent[],
  jobId: string,
) => Promise<void>;

/**
 * Callback invoked when a job is dead-lettered.
 */
export type DeadLetterCallback = (
  raw: RawVendorEvent,
  reason: string,
  jobId: string,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface NormalizationWorkerOptions {
  /** Redis connection config. */
  connection: ConnectionOptions;

  /** Max concurrent jobs. Defaults to 5. */
  concurrency?: number;

  /** Persist normalized events to the event store. */
  onPersist: PersistEventsCallback;

  /** Called when an event is sent to the dead-letter queue. */
  onDeadLetter?: DeadLetterCallback;

  /** Optional custom adapter registry (useful for testing). */
  registry?: AdapterRegistry;
}

// ---------------------------------------------------------------------------
// NormalizationWorker — BullMQ worker for the normalization queue
// ---------------------------------------------------------------------------

export class NormalizationWorker implements QueueWorker {
  readonly name = 'normalization-worker';
  readonly queueName = QUEUE_NAMES.NORMALIZATION;

  private readonly registry: AdapterRegistry;
  private readonly deadLetterQueue: Queue<DeadLetterEntry>;
  private worker: Worker<NormalizationJobData> | null = null;
  private readonly options: NormalizationWorkerOptions;

  private readonly stats: NormalizationStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  constructor(options: NormalizationWorkerOptions) {
    this.options = options;
    this.registry =
      options.registry ?? NormalizationWorker.createDefaultRegistry();
    this.deadLetterQueue = new Queue<DeadLetterEntry>(
      QUEUE_NAMES.NORMALIZATION_DLQ,
      { connection: options.connection },
    );
  }

  /**
   * Create a registry pre-loaded with built-in vendor adapters.
   */
  static createDefaultRegistry(): AdapterRegistry {
    const registry = new AdapterRegistry();
    registry.register(new PassthroughAdapter());
    registry.register(new OpenAIAgentsAdapter());
    registry.register(new GitHubCopilotAdapter());
    registry.register(new ClaudeCodeAdapter());
    return registry;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.worker) return; // Already running

    this.worker = new Worker<NormalizationJobData>(
      QUEUE_NAMES.NORMALIZATION,
      async (job: Job<NormalizationJobData>) => {
        await this.processJob(job);
      },
      {
        connection: this.options.connection,
        concurrency: this.options.concurrency ?? 5,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    this.worker.on('error', (err) => {
      // Logged at the Fastify layer via onError hook;
      // Worker-level errors are non-fatal operational errors.
      process.stderr.write(
        `[normalization-worker] BullMQ error: ${err.message}\n`,
      );
    });
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.deadLetterQueue.close();
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getStats(): Readonly<NormalizationStats> {
    return { ...this.stats };
  }

  /** Expose the adapter registry for inspection. */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }

  /** Check whether the worker is actively running. */
  isRunning(): boolean {
    return this.worker !== null;
  }

  // -----------------------------------------------------------------------
  // Job processing
  // -----------------------------------------------------------------------

  private async processJob(job: Job<NormalizationJobData>): Promise<void> {
    const { rawEvent, jobId } = job.data;
    this.stats.processed++;

    // --- Resolve adapter ---
    const adapter = this.registry.resolve(rawEvent);

    if (!adapter) {
      await this.handleFailure(
        rawEvent,
        `No adapter found for vendor "${rawEvent.vendor}"`,
        jobId,
      );
      return;
    }

    // --- Normalize ---
    const result = adapter.normalize(rawEvent);

    if (result.status === 'success') {
      this.stats.succeeded++;
      await this.options.onPersist(result.events, jobId);
      return;
    }

    // --- Normalization error ---
    await this.handleFailure(rawEvent, result.reason, jobId);
  }

  private async handleFailure(
    rawEvent: RawVendorEvent,
    reason: string,
    jobId: string,
  ): Promise<void> {
    this.stats.failed++;
    this.stats.deadLettered++;

    await this.deadLetterQueue.add('dead-letter', {
      originalJobId: jobId,
      rawEvent,
      reason,
      failedAt: new Date().toISOString(),
    });

    if (this.options.onDeadLetter) {
      await this.options.onDeadLetter(rawEvent, reason, jobId);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: create a producer queue for enqueuing normalization jobs
// ---------------------------------------------------------------------------

/**
 * Creates a BullMQ Queue for producing normalization jobs.
 * Used by ingest-api or other services to enqueue raw events.
 */
export function createNormalizationQueue(
  connection: ConnectionOptions,
): Queue<NormalizationJobData> {
  return new Queue<NormalizationJobData>(QUEUE_NAMES.NORMALIZATION, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
