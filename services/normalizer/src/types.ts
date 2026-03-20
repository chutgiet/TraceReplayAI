import type { RawVendorEvent } from '@tracereplay/connectors-core';

// ---------------------------------------------------------------------------
// Normalizer job types — what arrives on the BullMQ queue
// ---------------------------------------------------------------------------

/**
 * Job data shape for the normalization queue.
 * The worker service enqueues these after ingest-api receives raw events.
 */
export interface NormalizationJobData {
  /** Unique job identifier for idempotency. */
  jobId: string;

  /** The raw vendor event to normalize. */
  rawEvent: RawVendorEvent;

  /** Number of retry attempts so far. */
  attemptNumber: number;
}

// ---------------------------------------------------------------------------
// Normalization metrics / status
// ---------------------------------------------------------------------------

export interface NormalizerStats {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
}
