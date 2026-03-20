import type { RetryConfig, HttpResponse, HttpTransport } from './types.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30_000;

/** Determines whether an HTTP response status warrants a retry. */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/** Determines whether an error is a network/transient error worth retrying. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('fetch failed') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('timeout') ||
      msg.includes('abort') ||
      msg.includes('socket hang up')
    );
  }
  return false;
}

/** Calculate delay for a given attempt using exponential backoff with jitter. */
export function calculateDelay(attempt: number, config: Required<RetryConfig>): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  // Add jitter: 50-100% of the calculated delay
  const jitter = capped * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

export interface RetryableRequestOptions {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  transport: HttpTransport;
  retry: RetryConfig;
  timeoutMs: number;
}

/**
 * Execute an HTTP request with retry logic and exponential backoff.
 * Throws if all retries are exhausted or a non-retryable error occurs.
 */
export async function retryableRequest(options: RetryableRequestOptions): Promise<HttpResponse> {
  const config: Required<RetryConfig> = {
    maxRetries: options.retry.maxRetries ?? DEFAULT_MAX_RETRIES,
    baseDelayMs: options.retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: options.retry.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);

      try {
        const response = await options.transport(options.url, {
          method: options.method,
          headers: options.headers,
          body: options.body,
          signal: controller.signal as never,
        });

        // Non-retryable client error — return immediately
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Success — return
        if (response.status < 400) {
          return response;
        }

        // Retryable server error
        if (isRetryableStatus(response.status) && attempt < config.maxRetries) {
          lastError = new Error(`HTTP ${response.status}`);
          const delay = calculateDelay(attempt, config);
          await sleep(delay);
          continue;
        }

        return response;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastError = err;

      if (isRetryableError(err) && attempt < config.maxRetries) {
        const delay = calculateDelay(attempt, config);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
