import { randomUUID } from 'node:crypto';
import type {
  TraceReplayEvent,
  BaseEvent,
} from '@tracereplay/event-schema';
import { SCHEMA_VERSION, validateEvent } from '@tracereplay/event-schema';
import type {
  ClientConfig,
  StartRunOptions,
  SendResult,
  BatchSendResult,
  HttpResponse,
  HttpTransport,
} from './types.js';
import { retryableRequest, isRetryableError } from './retry.js';
import { RunTracer } from './run-tracer.js';

// ---------------------------------------------------------------------------
// Default fetch-based transport
// ---------------------------------------------------------------------------

async function defaultTransport(
  url: string,
  options: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
): Promise<HttpResponse> {
  const res = await fetch(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// TraceReplayClient
// ---------------------------------------------------------------------------

export class TraceReplayClient {
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly tenantId: string;
  private readonly validateBeforeSend: boolean;
  private readonly maxBufferSize: number;
  private readonly flushIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly retryConfig: { maxRetries: number; baseDelayMs: number; maxDelayMs: number };
  private readonly transport: HttpTransport;

  /** Offline event buffer — queued events when the endpoint is unreachable. */
  private buffer: Array<TraceReplayEvent | Record<string, unknown>> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: ClientConfig, transport?: HttpTransport) {
    if (!config.endpoint) {
      throw new Error('TraceReplayClient: endpoint is required');
    }
    if (!config.tenantId) {
      throw new Error('TraceReplayClient: tenantId is required');
    }

    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.tenantId = config.tenantId;
    this.validateBeforeSend = config.validateBeforeSend ?? false;
    this.maxBufferSize = config.maxBufferSize ?? 1_000;
    this.flushIntervalMs = config.flushIntervalMs ?? 5_000;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.retryConfig = {
      maxRetries: config.retry?.maxRetries ?? 3,
      baseDelayMs: config.retry?.baseDelayMs ?? 500,
      maxDelayMs: config.retry?.maxDelayMs ?? 30_000,
    };
    this.transport = transport ?? defaultTransport;

    this.startFlushInterval();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Send a single event to the ingest API. */
  async sendEvent(event: TraceReplayEvent | Record<string, unknown>): Promise<SendResult> {
    if (this.validateBeforeSend) {
      const validation = validateEvent(event);
      if (!validation.success) {
        throw new Error(`Event validation failed: ${validation.error.message}`);
      }
    }

    try {
      const response = await this.post('/v1/events', event);

      if (response.status === 201 || response.status === 200) {
        const data = (response.body as { data?: { eventId?: string; status?: string } })?.data;
        return {
          eventId: data?.eventId ?? (event as Record<string, unknown>).id as string ?? 'unknown',
          status: (data?.status as 'created' | 'duplicate') ?? 'created',
        };
      }

      throw new Error(`Ingest API returned ${response.status}: ${JSON.stringify(response.body)}`);
    } catch (err) {
      if (isRetryableError(err)) {
        return this.bufferEvent(event);
      }
      throw err;
    }
  }

  /** Send a batch of events to the ingest API. */
  async sendBatch(events: Array<TraceReplayEvent | Record<string, unknown>>): Promise<BatchSendResult> {
    if (events.length === 0) {
      return { results: [], errors: [] };
    }

    if (this.validateBeforeSend) {
      for (let i = 0; i < events.length; i++) {
        const validation = validateEvent(events[i]);
        if (!validation.success) {
          throw new Error(`Event at index ${i} failed validation: ${validation.error.message}`);
        }
      }
    }

    try {
      const response = await this.post('/v1/events/batch', events);

      if (response.status === 201 || response.status === 200) {
        const body = response.body as {
          data?: { results?: SendResult[]; errors?: Array<{ index: number; error: string }> };
        };
        return {
          results: body?.data?.results ?? events.map((e, i) => ({
            eventId: (e as Record<string, unknown>).id as string ?? `event-${i}`,
            status: 'created' as const,
          })),
          errors: body?.data?.errors ?? [],
        };
      }

      if (response.status === 207) {
        const body = response.body as {
          data?: { results?: SendResult[]; errors?: Array<{ index: number; error: string }> };
        };
        return {
          results: body?.data?.results ?? [],
          errors: body?.data?.errors ?? [],
        };
      }

      throw new Error(`Ingest API returned ${response.status}: ${JSON.stringify(response.body)}`);
    } catch (err) {
      if (isRetryableError(err)) {
        const results: SendResult[] = [];
        for (const event of events) {
          results.push(this.bufferEvent(event));
        }
        return { results, errors: [] };
      }
      throw err;
    }
  }

  /** Create a RunTracer that auto-generates a runId and provides convenience methods. */
  startRun(opts: StartRunOptions): RunTracer {
    return new RunTracer(this, opts);
  }

  /** Get the number of events currently buffered offline. */
  get bufferedCount(): number {
    return this.buffer.length;
  }

  /** Manually flush the offline buffer. Returns the number of events flushed. */
  async flush(): Promise<number> {
    return this.flushBuffer();
  }

  /** Stop the flush interval and release resources. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: used by RunTracer
  // -----------------------------------------------------------------------

  /** @internal Build a base event object with auto-populated fields. */
  buildEvent<T extends Record<string, unknown>>(
    type: string,
    runId: string,
    sourceAgent: string,
    payload: T,
    overrides?: Partial<BaseEvent>,
  ): Record<string, unknown> {
    return {
      id: randomUUID(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      tenantId: this.tenantId,
      sourceAgent,
      payload,
      schemaVersion: SCHEMA_VERSION,
      ...overrides,
    };
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async post(path: string, body: unknown): Promise<HttpResponse> {
    return retryableRequest({
      url: `${this.endpoint}${path}`,
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      transport: this.transport,
      retry: this.retryConfig,
      timeoutMs: this.timeoutMs,
    });
  }

  private bufferEvent(event: TraceReplayEvent | Record<string, unknown>): SendResult {
    if (this.buffer.length >= this.maxBufferSize) {
      // Drop oldest event to make room
      this.buffer.shift();
    }
    this.buffer.push(event);
    return {
      eventId: (event as Record<string, unknown>).id as string ?? 'unknown',
      status: 'buffered',
    };
  }

  private startFlushInterval(): void {
    this.flushTimer = setInterval(() => {
      void this.flushBuffer();
    }, this.flushIntervalMs);

    // Unref so the timer doesn't keep the process alive
    if (typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  private async flushBuffer(): Promise<number> {
    if (this.flushing || this.buffer.length === 0) {
      return 0;
    }

    this.flushing = true;
    let flushed = 0;

    try {
      // Drain in batches of 100 (ingest API batch limit)
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, 100);

        try {
          const response = await this.post('/v1/events/batch', batch);

          if (response.status >= 200 && response.status < 300) {
            flushed += batch.length;
          } else if (response.status >= 500 || response.status === 429) {
            // Put them back and stop — endpoint still unhealthy
            this.buffer.unshift(...batch);
            break;
          } else {
            // 4xx — events are invalid, drop them
            flushed += batch.length;
          }
        } catch {
          // Network still down — put events back and stop
          this.buffer.unshift(...batch);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }

    return flushed;
  }
}
