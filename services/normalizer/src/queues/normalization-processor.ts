import { Worker, Queue } from 'bullmq';
import type { Job, ConnectionOptions } from 'bullmq';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { RawVendorEvent } from '@tracereplay/connectors-core';
import { NormalizationService } from '../services/normalization-service.js';
import type { NormalizationJobData } from '../types.js';

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const NORMALIZATION_QUEUE = 'normalization';
export const DEAD_LETTER_QUEUE = 'normalization-dlq';

// ---------------------------------------------------------------------------
// Queue processor — consumes raw events, produces canonical events
// ---------------------------------------------------------------------------

export interface NormalizationProcessorOptions {
  /** Redis connection config for BullMQ. */
  connection: ConnectionOptions;

  /** Max concurrent jobs per worker. */
  concurrency?: number;

  /**
   * Callback invoked with successfully normalized canonical events.
   * Implementors persist these to the event store.
   */
  onNormalized: (events: TraceReplayEvent[], jobId: string) => Promise<void>;

  /**
   * Callback invoked when an event is sent to the dead-letter queue.
   */
  onDeadLetter?: (raw: RawVendorEvent, reason: string, jobId: string) => Promise<void>;
}

export class NormalizationProcessor {
  private readonly service: NormalizationService;
  private readonly deadLetterQueue: Queue;
  private worker: Worker | null = null;
  private readonly options: NormalizationProcessorOptions;

  constructor(
    options: NormalizationProcessorOptions,
    service?: NormalizationService,
  ) {
    this.options = options;
    this.service = service ?? new NormalizationService();
    this.deadLetterQueue = new Queue(DEAD_LETTER_QUEUE, {
      connection: options.connection,
    });
  }

  /**
   * Start consuming from the normalization queue.
   */
  async start(): Promise<void> {
    this.worker = new Worker<NormalizationJobData>(
      NORMALIZATION_QUEUE,
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
      process.stderr.write(`[normalizer] Worker error: ${err.message}\n`);
    });
  }

  /**
   * Gracefully stop the worker and close the dead-letter queue.
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.deadLetterQueue.close();
  }

  /** Get normalization stats. */
  getStats() {
    return this.service.getStats();
  }

  /** Expose the service for direct normalization (useful in tests). */
  getService(): NormalizationService {
    return this.service;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async processJob(job: Job<NormalizationJobData>): Promise<void> {
    const { rawEvent, jobId } = job.data;

    const result = this.service.normalizeEvent(rawEvent);

    if (result.status === 'success') {
      await this.options.onNormalized(result.events, jobId);
      return;
    }

    // Normalization failed — send to dead-letter queue
    this.service.recordDeadLetter();

    await this.deadLetterQueue.add('dead-letter', {
      originalJobId: jobId,
      rawEvent,
      reason: result.reason,
      failedAt: new Date().toISOString(),
    });

    if (this.options.onDeadLetter) {
      await this.options.onDeadLetter(rawEvent, result.reason, jobId);
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: enqueue raw events for normalization
// ---------------------------------------------------------------------------

/**
 * Creates a Queue instance for producing normalization jobs.
 * Used by the ingest-api or worker service to enqueue raw events.
 */
export function createNormalizationQueue(connection: ConnectionOptions): Queue<NormalizationJobData> {
  return new Queue<NormalizationJobData>(NORMALIZATION_QUEUE, {
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
