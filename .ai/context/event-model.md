# TraceReplay AI — Canonical Event Model

## Overview

All agent telemetry is normalized into a canonical event model before storage. This provides a stable, framework-agnostic representation that the replay engine, lineage graph, and evidence service can rely on.

---

## Base event shape

Every event in the system conforms to this base structure:

```typescript
interface BaseEvent {
  /** Unique event identifier (UUID v7 recommended for time-ordering) */
  id: string;

  /** Run this event belongs to */
  runId: string;

  /** Event type discriminator */
  type: EventType;

  /** ISO 8601 timestamp of when the event occurred at source */
  timestamp: string;

  /** Sequence number within the run (source-assigned, may have gaps) */
  sequence?: number;

  /** Parent event ID for causal linking */
  parentEventId?: string;

  /** Tenant/org identifier */
  tenantId: string;

  /** Agent or service that produced this event */
  sourceAgent: string;

  /** Framework that produced the raw telemetry */
  sourceFramework?: string;

  /** Event-specific payload (varies by type) */
  payload: Record<string, unknown>;

  /** Metadata preserved from raw ingestion */
  rawMeta?: Record<string, unknown>;

  /** Tags for filtering and categorization */
  tags?: string[];

  /** Schema version of this event */
  schemaVersion: string;
}
```

---

## Event types

```typescript
type EventType =
  | 'run.start'
  | 'run.end'
  | 'run.error'
  | 'prompt.input'
  | 'prompt.output'
  | 'context.retrieved'
  | 'context.injected'
  | 'tool.call.start'
  | 'tool.call.end'
  | 'tool.call.error'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'side_effect.executed'
  | 'side_effect.failed'
  | 'model.request'
  | 'model.response'
  | 'policy.evaluated'
  | 'policy.violated'
  | 'annotation'
  | 'custom';
```

---

## Event type payloads

### `run.start`
```typescript
{
  runName?: string;
  triggerSource?: string;    // "api", "schedule", "user", "agent"
  parentRunId?: string;      // for sub-agent delegation
  configuration?: Record<string, unknown>;
}
```

### `run.end`
```typescript
{
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  durationMs?: number;
  summary?: string;
}
```

### `run.error`
```typescript
{
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  fatal: boolean;
}
```

### `prompt.input`
```typescript
{
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;          // may be "[REDACTED]"
  contentHash?: string;     // hash of original content for integrity
  tokenCount?: number;
}
```

### `prompt.output`
```typescript
{
  content: string;
  contentHash?: string;
  tokenCount?: number;
  finishReason?: string;
  modelId?: string;
}
```

### `context.retrieved`
```typescript
{
  source: string;           // "vector_db", "api", "file", "web"
  query?: string;
  documentIds?: string[];
  snippetCount?: number;
  relevanceScores?: number[];
  content?: string;         // may be redacted
}
```

### `tool.call.start`
```typescript
{
  toolName: string;
  toolId?: string;
  inputParameters: Record<string, unknown>;
}
```

### `tool.call.end`
```typescript
{
  toolName: string;
  toolId?: string;
  output: unknown;
  durationMs?: number;
  success: boolean;
}
```

### `tool.call.error`
```typescript
{
  toolName: string;
  toolId?: string;
  errorType: string;
  errorMessage: string;
}
```

### `approval.requested`
```typescript
{
  approvalType: string;     // "human", "system", "policy"
  requestedAction: string;
  requestedBy: string;
  context?: Record<string, unknown>;
}
```

### `approval.granted` / `approval.denied`
```typescript
{
  approvalType: string;
  decidedBy: string;
  reason?: string;
  durationMs?: number;
}
```

### `side_effect.executed`
```typescript
{
  effectType: string;       // "api_call", "db_write", "email", "file_write", "message"
  targetSystem: string;
  description: string;
  reversible: boolean;
  metadata?: Record<string, unknown>;
}
```

### `model.request` / `model.response`
```typescript
{
  modelProvider: string;    // "openai", "anthropic", "azure", "local"
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cost?: number;
  temperature?: number;
}
```

### `policy.evaluated` / `policy.violated`
```typescript
{
  policyId: string;
  policyName: string;
  result: 'pass' | 'warn' | 'fail';
  details?: string;
}
```

---

## Event lifecycle

```
Raw telemetry (vendor-specific)
    ↓ Ingest API (validate shape, assign ID if missing)
Queued raw event
    ↓ Normalizer (map to canonical type, enrich)
Canonical event
    ↓ Redaction engine (apply redaction rules)
Redacted canonical event
    ↓ Event store (persist immutably)
Stored event
    ↓ Replay engine / Lineage graph / Query service
Queryable event
```

---

## Normalization rules

1. Every event MUST have `id`, `runId`, `type`, `timestamp`, `tenantId`
2. If source provides no `id`, generate a deterministic one from `(runId + type + timestamp + hash(payload))`
3. Timestamps normalized to UTC ISO 8601
4. Unknown event types mapped to `custom` with original type preserved in `rawMeta`
5. Missing optional fields left as `undefined` — never fabricated
6. Raw vendor payload preserved in `rawMeta` for forensic inspection

---

## Schema versioning

- Current version: `1.0.0`
- Schema changes follow semver
- Backward-compatible additions: minor version bump
- Breaking changes: major version bump + migration
- All stored events retain their `schemaVersion` for future migration
