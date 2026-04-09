// ---------------------------------------------------------------------------
// Queue names and job data types for ollama processing
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  OLLAMA_PROCESSING: 'ollama-processing',
  OLLAMA_DLQ: 'ollama-processing-dlq',
} as const;

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export type OllamaJobType = 'run-summary' | 'anomaly-check' | 'compliance-scan';

export interface OllamaJobData {
  /** Unique job identifier for idempotency. */
  jobId: string;

  /** Job type discriminator. */
  type: OllamaJobType;

  /** Run ID to process. */
  runId: string;

  /** Tenant ID for the run. */
  tenantId: string;

  /** Number of retry attempts so far. */
  attemptNumber: number;
}

export interface OllamaDeadLetterEntry {
  originalJobId: string;
  type: OllamaJobType;
  runId: string;
  reason: string;
  failedAt: string;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface OllamaProcessorStats {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  ollamaUnavailable: number;
}
