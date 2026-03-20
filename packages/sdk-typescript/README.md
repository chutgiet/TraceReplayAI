# @tracereplay/sdk-typescript

Lightweight TypeScript SDK for sending AI agent telemetry events to a TraceReplay AI ingest API.

## Installation

```bash
pnpm add @tracereplay/sdk-typescript
```

## Quick start

```typescript
import { TraceReplayClient } from '@tracereplay/sdk-typescript';

const client = new TraceReplayClient({
  endpoint: 'https://ingest.tracereplay.ai',
  tenantId: 'your-tenant-id',
  apiKey: 'sk-your-api-key', // optional
});

// Start a traced run
const run = client.startRun({
  sourceAgent: 'my-agent',
  runName: 'Customer query resolution',
  triggerSource: 'api',
});

// Log a prompt
await run.logPrompt({
  role: 'user',
  content: 'What is the status of order #1234?',
  tokenCount: 12,
});

// Log a tool call
await run.logToolCall({
  toolName: 'order_lookup',
  inputParameters: { orderId: '1234' },
});

await run.logToolCallEnd({
  toolName: 'order_lookup',
  output: { status: 'shipped', trackingId: 'TRK-5678' },
  success: true,
  durationMs: 230,
});

// Log the model response
await run.logPromptOutput({
  content: 'Order #1234 has been shipped. Tracking: TRK-5678.',
  finishReason: 'stop',
  modelId: 'gpt-4',
});

// End the run
await run.end('success', { summary: 'Resolved order status query' });

// Clean up when your process shuts down
client.destroy();
```

## API

### `TraceReplayClient`

```typescript
new TraceReplayClient(config: ClientConfig, transport?: HttpTransport)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | *required* | Ingest API base URL |
| `tenantId` | `string` | *required* | Tenant/org identifier |
| `apiKey` | `string` | — | Bearer token for auth |
| `retry` | `RetryConfig` | `{maxRetries:3, baseDelayMs:500, maxDelayMs:30000}` | Retry config |
| `validateBeforeSend` | `boolean` | `false` | Zod-validate events locally before sending |
| `maxBufferSize` | `number` | `1000` | Max offline buffer size |
| `flushIntervalMs` | `number` | `5000` | Offline buffer flush interval |
| `timeoutMs` | `number` | `10000` | HTTP request timeout |

**Methods:**

- `sendEvent(event)` — POST a single event to `/v1/events`
- `sendBatch(events)` — POST an array of events to `/v1/events/batch`
- `startRun(opts) → RunTracer` — Create a new traced run
- `flush() → Promise<number>` — Manually flush offline buffer
- `destroy()` — Stop background flush timer

### `RunTracer`

Returned by `client.startRun()`. Auto-generates a `runId` and emits `run.start`.

**Methods:**

- `logPrompt(payload, parentEventId?)` — `prompt.input`
- `logPromptOutput(payload, parentEventId?)` — `prompt.output`
- `logToolCall(payload, parentEventId?)` — `tool.call.start`
- `logToolCallEnd(payload, parentEventId?)` — `tool.call.end`
- `logToolCallError(payload, parentEventId?)` — `tool.call.error`
- `logError(payload, parentEventId?)` — `run.error`
- `logCustom(payload, parentEventId?)` — `custom`
- `logAnnotation(payload, parentEventId?)` — `annotation`
- `emitEvent(type, payload, parentEventId?)` — any event type
- `end(status?, opts?)` — `run.end` (marks tracer as ended)

**Properties:**

- `runId: string` — Generated run identifier
- `isEnded: boolean` — Whether `end()` has been called

## Offline buffering

When the ingest endpoint is unreachable, events are queued in memory and automatically flushed when connectivity returns. The buffer respects `maxBufferSize` (oldest events dropped first) and flushes on a configurable interval.

## Retry

Retries use exponential backoff with jitter for `5xx` and `429` responses, as well as network errors. Configure via `retry` in `ClientConfig`.
