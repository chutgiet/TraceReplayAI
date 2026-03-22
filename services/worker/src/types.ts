import type { RawVendorEvent } from '@tracereplay/connectors-core';
import type { ConnectionOptions } from 'bullmq';

// ---------------------------------------------------------------------------
// Worker configuration
// ---------------------------------------------------------------------------

export interface WorkerConfig {
  /** Fastify HTTP server port. */
  port: number;

  /** Fastify HTTP server host. */
  host: string;

  /** BullMQ Redis connection options. */
  redis: ConnectionOptions;

  /** Log level for Fastify. */
  logLevel: string;

  /** Max concurrent jobs per normalization worker. */
  normalizationConcurrency: number;
}

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  NORMALIZATION: 'normalization',
  NORMALIZATION_DLQ: 'normalization-dlq',
} as const;

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

/**
 * Job data shape for the normalization queue.
 * The ingest-api enqueues these when raw vendor events arrive.
 */
export interface NormalizationJobData {
  /** Unique job identifier for idempotency tracking. */
  jobId: string;

  /** The raw vendor event to normalize. */
  rawEvent: RawVendorEvent;

  /** Number of retry attempts so far (tracked by BullMQ). */
  attemptNumber: number;
}

/**
 * Dead-letter entry for failed normalization jobs.
 */
export interface DeadLetterEntry {
  /** Original job ID that failed. */
  originalJobId: string;

  /** The raw event that could not be normalized. */
  rawEvent: RawVendorEvent;

  /** Reason for failure. */
  reason: string;

  /** ISO 8601 timestamp of when the failure occurred. */
  failedAt: string;
}

// ---------------------------------------------------------------------------
// Worker stats
// ---------------------------------------------------------------------------

export interface WorkerStats {
  normalization: NormalizationStats;
  uptime: number;
  startedAt: string;
}

export interface NormalizationStats {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
}

// ---------------------------------------------------------------------------
// Queue worker interface — implemented by each queue processor
// ---------------------------------------------------------------------------

/**
 * Common interface for queue worker processors.
 * Each queue type implements this so the QueueManager can manage them uniformly.
 */
export interface QueueWorker {
  /** Human-readable name for logging. */
  readonly name: string;

  /** BullMQ queue name this worker processes. */
  readonly queueName: string;

  /** Start consuming jobs from the queue. */
  start(): Promise<void>;

  /** Gracefully stop the worker, waiting for active jobs to finish. */
  stop(): Promise<void>;

  /** Current stats snapshot. */
  getStats(): Readonly<NormalizationStats>;
}
