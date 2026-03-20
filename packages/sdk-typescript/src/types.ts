

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface ClientConfig {
  /** Base URL of the TraceReplay ingest API (e.g. "https://ingest.tracereplay.ai"). */
  endpoint: string;

  /** Optional API key for authenticated ingestion. */
  apiKey?: string;

  /** Tenant/org identifier attached to all events. */
  tenantId: string;

  /** Retry configuration. */
  retry?: RetryConfig;

  /** Enable Zod validation before sending (disabled by default for perf). */
  validateBeforeSend?: boolean;

  /** Maximum events to buffer when endpoint is unreachable. Defaults to 1000. */
  maxBufferSize?: number;

  /** Interval in ms to attempt flushing the offline buffer. Defaults to 5000. */
  flushIntervalMs?: number;

  /** Request timeout in ms. Defaults to 10000. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of retry attempts. Defaults to 3. */
  maxRetries?: number;

  /** Base delay in ms for exponential backoff. Defaults to 500. */
  baseDelayMs?: number;

  /** Maximum delay in ms between retries. Defaults to 30000. */
  maxDelayMs?: number;
}

// ---------------------------------------------------------------------------
// Send results
// ---------------------------------------------------------------------------

export interface SendResult {
  eventId: string;
  status: 'created' | 'duplicate' | 'buffered';
}

export interface BatchSendResult {
  results: SendResult[];
  errors: Array<{ index: number; error: string }>;
}

// ---------------------------------------------------------------------------
// RunTracer options
// ---------------------------------------------------------------------------

export interface StartRunOptions {
  /** Optional human-readable name for the run. */
  runName?: string;

  /** What triggered this run. */
  triggerSource?: 'api' | 'schedule' | 'user' | 'agent';

  /** Parent run ID for sub-agent delegation. */
  parentRunId?: string;

  /** Agent or service identifier. */
  sourceAgent: string;

  /** Framework that produced the raw telemetry. */
  sourceFramework?: string;

  /** Additional configuration metadata. */
  configuration?: Record<string, unknown>;

  /** Tags for filtering. */
  tags?: string[];
}

// ---------------------------------------------------------------------------
// HTTP transport abstraction (for testability)
// ---------------------------------------------------------------------------

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type HttpTransport = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal | undefined;
  },
) => Promise<HttpResponse>;
