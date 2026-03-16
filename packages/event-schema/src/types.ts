// ---------------------------------------------------------------------------
// Branded ID types
// ---------------------------------------------------------------------------

/** Branded string type for event identifiers. */
export type EventId = string & { readonly __brand: 'EventId' };

/** Branded string type for run identifiers. */
export type RunId = string & { readonly __brand: 'RunId' };

/** Branded string type for tenant/org identifiers. */
export type TenantId = string & { readonly __brand: 'TenantId' };

// ---------------------------------------------------------------------------
// Event type discriminator
// ---------------------------------------------------------------------------

export type EventType =
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

// ---------------------------------------------------------------------------
// Base event shape
// ---------------------------------------------------------------------------

export interface BaseEvent {
  /** Unique event identifier (UUID v7 recommended). */
  id: EventId;

  /** Run this event belongs to. */
  runId: RunId;

  /** Event type discriminator. */
  type: EventType;

  /** ISO 8601 timestamp of when the event occurred at source. */
  timestamp: string;

  /** Sequence number within the run (source-assigned, may have gaps). */
  sequence?: number;

  /** Parent event ID for causal linking. */
  parentEventId?: EventId;

  /** Tenant/org identifier. */
  tenantId: TenantId;

  /** Agent or service that produced this event. */
  sourceAgent: string;

  /** Framework that produced the raw telemetry. */
  sourceFramework?: string;

  /** Event-specific payload (varies by type). */
  payload: Record<string, unknown>;

  /** Metadata preserved from raw ingestion. */
  rawMeta?: Record<string, unknown>;

  /** Tags for filtering and categorisation. */
  tags?: string[];

  /** Schema version of this event. */
  schemaVersion: string;
}

// ---------------------------------------------------------------------------
// Payload interfaces — run lifecycle
// ---------------------------------------------------------------------------

export interface RunStartPayload {
  runName?: string;
  triggerSource?: 'api' | 'schedule' | 'user' | 'agent';
  parentRunId?: string;
  configuration?: Record<string, unknown>;
}

export interface RunEndPayload {
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  durationMs?: number;
  summary?: string;
}

export interface RunErrorPayload {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  fatal: boolean;
}

// ---------------------------------------------------------------------------
// Payload interfaces — prompt telemetry
// ---------------------------------------------------------------------------

export interface PromptInputPayload {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  contentHash?: string;
  tokenCount?: number;
}

export interface PromptOutputPayload {
  content: string;
  contentHash?: string;
  tokenCount?: number;
  finishReason?: string;
  modelId?: string;
}

// ---------------------------------------------------------------------------
// Payload interfaces — context
// ---------------------------------------------------------------------------

export interface ContextRetrievedPayload {
  source: string;
  query?: string;
  documentIds?: string[];
  snippetCount?: number;
  relevanceScores?: number[];
  content?: string;
}

export interface ContextInjectedPayload {
  source: string;
  tokenCount?: number;
  content?: string;
}

// ---------------------------------------------------------------------------
// Payload interfaces — tool calls
// ---------------------------------------------------------------------------

export interface ToolCallStartPayload {
  toolName: string;
  toolId?: string;
  inputParameters: Record<string, unknown>;
}

export interface ToolCallEndPayload {
  toolName: string;
  toolId?: string;
  output: unknown;
  durationMs?: number;
  success: boolean;
}

export interface ToolCallErrorPayload {
  toolName: string;
  toolId?: string;
  errorType: string;
  errorMessage: string;
}

// ---------------------------------------------------------------------------
// Payload interfaces — approvals
// ---------------------------------------------------------------------------

export interface ApprovalRequestedPayload {
  approvalType: string;
  requestedAction: string;
  requestedBy: string;
  context?: Record<string, unknown>;
}

export interface ApprovalGrantedPayload {
  approvalType: string;
  decidedBy: string;
  reason?: string;
  durationMs?: number;
}

export interface ApprovalDeniedPayload {
  approvalType: string;
  decidedBy: string;
  reason?: string;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Payload interfaces — side effects
// ---------------------------------------------------------------------------

export interface SideEffectExecutedPayload {
  effectType: string;
  targetSystem: string;
  description: string;
  reversible: boolean;
  metadata?: Record<string, unknown>;
}

export interface SideEffectFailedPayload {
  effectType: string;
  targetSystem: string;
  description: string;
  errorType: string;
  errorMessage: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Payload interfaces — model interactions
// ---------------------------------------------------------------------------

export interface ModelRequestPayload {
  modelProvider: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cost?: number;
  temperature?: number;
}

export interface ModelResponsePayload {
  modelProvider: string;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cost?: number;
  temperature?: number;
}

// ---------------------------------------------------------------------------
// Payload interfaces — policy
// ---------------------------------------------------------------------------

export interface PolicyEvaluatedPayload {
  policyId: string;
  policyName: string;
  result: 'pass' | 'warn' | 'fail';
  details?: string;
}

export interface PolicyViolatedPayload {
  policyId: string;
  policyName: string;
  result: 'pass' | 'warn' | 'fail';
  details?: string;
}

// ---------------------------------------------------------------------------
// Payload interfaces — annotation & custom
// ---------------------------------------------------------------------------

export interface AnnotationPayload {
  key: string;
  value: unknown;
  annotatedBy?: string;
}

export interface CustomPayload {
  customType?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Typed event map — maps EventType → typed event with specific payload
// ---------------------------------------------------------------------------

export type PayloadMap = {
  'run.start': RunStartPayload;
  'run.end': RunEndPayload;
  'run.error': RunErrorPayload;
  'prompt.input': PromptInputPayload;
  'prompt.output': PromptOutputPayload;
  'context.retrieved': ContextRetrievedPayload;
  'context.injected': ContextInjectedPayload;
  'tool.call.start': ToolCallStartPayload;
  'tool.call.end': ToolCallEndPayload;
  'tool.call.error': ToolCallErrorPayload;
  'approval.requested': ApprovalRequestedPayload;
  'approval.granted': ApprovalGrantedPayload;
  'approval.denied': ApprovalDeniedPayload;
  'side_effect.executed': SideEffectExecutedPayload;
  'side_effect.failed': SideEffectFailedPayload;
  'model.request': ModelRequestPayload;
  'model.response': ModelResponsePayload;
  'policy.evaluated': PolicyEvaluatedPayload;
  'policy.violated': PolicyViolatedPayload;
  'annotation': AnnotationPayload;
  'custom': CustomPayload;
};

/** A fully-typed event whose `payload` is narrowed by `type`. */
export type TypedEvent<T extends EventType = EventType> = Omit<BaseEvent, 'type' | 'payload'> & {
  type: T;
  payload: PayloadMap[T];
};

/** Discriminated union of all typed events. */
export type TraceReplayEvent =
  | TypedEvent<'run.start'>
  | TypedEvent<'run.end'>
  | TypedEvent<'run.error'>
  | TypedEvent<'prompt.input'>
  | TypedEvent<'prompt.output'>
  | TypedEvent<'context.retrieved'>
  | TypedEvent<'context.injected'>
  | TypedEvent<'tool.call.start'>
  | TypedEvent<'tool.call.end'>
  | TypedEvent<'tool.call.error'>
  | TypedEvent<'approval.requested'>
  | TypedEvent<'approval.granted'>
  | TypedEvent<'approval.denied'>
  | TypedEvent<'side_effect.executed'>
  | TypedEvent<'side_effect.failed'>
  | TypedEvent<'model.request'>
  | TypedEvent<'model.response'>
  | TypedEvent<'policy.evaluated'>
  | TypedEvent<'policy.violated'>
  | TypedEvent<'annotation'>
  | TypedEvent<'custom'>;
