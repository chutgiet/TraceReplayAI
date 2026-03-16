import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  EVENT_TYPES,
  RUN_STATUSES,
  PROMPT_ROLES,
  POLICY_RESULTS,
  TRIGGER_SOURCES,
  SCHEMA_VERSION,
} from './constants.js';
import type { EventType, TraceReplayEvent } from './types.js';

// ---------------------------------------------------------------------------
// Branded ID schemas
// ---------------------------------------------------------------------------

export const eventIdSchema = z.string().uuid();
export const runIdSchema = z.string().uuid();
export const tenantIdSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// Event type schema
// ---------------------------------------------------------------------------

export const eventTypeSchema = z.enum(EVENT_TYPES as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// Payload schemas — run lifecycle
// ---------------------------------------------------------------------------

export const runStartPayloadSchema = z.object({
  runName: z.string().optional(),
  triggerSource: z.enum(TRIGGER_SOURCES).optional(),
  parentRunId: z.string().optional(),
  configuration: z.record(z.unknown()).optional(),
}).passthrough();

export const runEndPayloadSchema = z.object({
  status: z.enum(RUN_STATUSES),
  durationMs: z.number().nonnegative().optional(),
  summary: z.string().optional(),
}).passthrough();

export const runErrorPayloadSchema = z.object({
  errorType: z.string(),
  errorMessage: z.string(),
  stackTrace: z.string().optional(),
  fatal: z.boolean(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — prompt telemetry
// ---------------------------------------------------------------------------

export const promptInputPayloadSchema = z.object({
  role: z.enum(PROMPT_ROLES),
  content: z.string(),
  contentHash: z.string().optional(),
  tokenCount: z.number().int().nonnegative().optional(),
}).passthrough();

export const promptOutputPayloadSchema = z.object({
  content: z.string(),
  contentHash: z.string().optional(),
  tokenCount: z.number().int().nonnegative().optional(),
  finishReason: z.string().optional(),
  modelId: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — context
// ---------------------------------------------------------------------------

export const contextRetrievedPayloadSchema = z.object({
  source: z.string(),
  query: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
  snippetCount: z.number().int().nonnegative().optional(),
  relevanceScores: z.array(z.number()).optional(),
  content: z.string().optional(),
}).passthrough();

export const contextInjectedPayloadSchema = z.object({
  source: z.string(),
  tokenCount: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — tool calls
// ---------------------------------------------------------------------------

export const toolCallStartPayloadSchema = z.object({
  toolName: z.string(),
  toolId: z.string().optional(),
  inputParameters: z.record(z.unknown()),
}).passthrough();

export const toolCallEndPayloadSchema = z.object({
  toolName: z.string(),
  toolId: z.string().optional(),
  output: z.unknown(),
  durationMs: z.number().nonnegative().optional(),
  success: z.boolean(),
}).passthrough();

export const toolCallErrorPayloadSchema = z.object({
  toolName: z.string(),
  toolId: z.string().optional(),
  errorType: z.string(),
  errorMessage: z.string(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — approvals
// ---------------------------------------------------------------------------

export const approvalRequestedPayloadSchema = z.object({
  approvalType: z.string(),
  requestedAction: z.string(),
  requestedBy: z.string(),
  context: z.record(z.unknown()).optional(),
}).passthrough();

export const approvalGrantedPayloadSchema = z.object({
  approvalType: z.string(),
  decidedBy: z.string(),
  reason: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
}).passthrough();

export const approvalDeniedPayloadSchema = z.object({
  approvalType: z.string(),
  decidedBy: z.string(),
  reason: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — side effects
// ---------------------------------------------------------------------------

export const sideEffectExecutedPayloadSchema = z.object({
  effectType: z.string(),
  targetSystem: z.string(),
  description: z.string(),
  reversible: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export const sideEffectFailedPayloadSchema = z.object({
  effectType: z.string(),
  targetSystem: z.string(),
  description: z.string(),
  errorType: z.string(),
  errorMessage: z.string(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — model interactions
// ---------------------------------------------------------------------------

const modelFieldsSchema = {
  modelProvider: z.string(),
  modelId: z.string(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  temperature: z.number().optional(),
};

export const modelRequestPayloadSchema = z.object(modelFieldsSchema).passthrough();
export const modelResponsePayloadSchema = z.object(modelFieldsSchema).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — policy
// ---------------------------------------------------------------------------

const policyFieldsSchema = {
  policyId: z.string(),
  policyName: z.string(),
  result: z.enum(POLICY_RESULTS),
  details: z.string().optional(),
};

export const policyEvaluatedPayloadSchema = z.object(policyFieldsSchema).passthrough();
export const policyViolatedPayloadSchema = z.object(policyFieldsSchema).passthrough();

// ---------------------------------------------------------------------------
// Payload schemas — annotation & custom
// ---------------------------------------------------------------------------

export const annotationPayloadSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  annotatedBy: z.string().optional(),
}).passthrough();

export const customPayloadSchema = z.object({
  customType: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Payload schema map — EventType → Zod schema
// ---------------------------------------------------------------------------

export const payloadSchemaMap = {
  'run.start': runStartPayloadSchema,
  'run.end': runEndPayloadSchema,
  'run.error': runErrorPayloadSchema,
  'prompt.input': promptInputPayloadSchema,
  'prompt.output': promptOutputPayloadSchema,
  'context.retrieved': contextRetrievedPayloadSchema,
  'context.injected': contextInjectedPayloadSchema,
  'tool.call.start': toolCallStartPayloadSchema,
  'tool.call.end': toolCallEndPayloadSchema,
  'tool.call.error': toolCallErrorPayloadSchema,
  'approval.requested': approvalRequestedPayloadSchema,
  'approval.granted': approvalGrantedPayloadSchema,
  'approval.denied': approvalDeniedPayloadSchema,
  'side_effect.executed': sideEffectExecutedPayloadSchema,
  'side_effect.failed': sideEffectFailedPayloadSchema,
  'model.request': modelRequestPayloadSchema,
  'model.response': modelResponsePayloadSchema,
  'policy.evaluated': policyEvaluatedPayloadSchema,
  'policy.violated': policyViolatedPayloadSchema,
  'annotation': annotationPayloadSchema,
  'custom': customPayloadSchema,
} as const;

// ---------------------------------------------------------------------------
// Base event schema (without type-specific payload validation)
// ---------------------------------------------------------------------------

export const baseEventSchema = z.object({
  id: eventIdSchema,
  runId: runIdSchema,
  type: eventTypeSchema,
  timestamp: z.string().datetime({ offset: true }),
  sequence: z.number().int().nonnegative().optional(),
  parentEventId: eventIdSchema.optional(),
  tenantId: tenantIdSchema,
  sourceAgent: z.string().min(1),
  sourceFramework: z.string().optional(),
  payload: z.record(z.unknown()),
  rawMeta: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  schemaVersion: z.string(),
});

// ---------------------------------------------------------------------------
// Discriminated event schemas — one for each event type
// ---------------------------------------------------------------------------

function typedEventSchema<T extends EventType>(
  eventType: T,
  payloadSchema: z.ZodTypeAny,
): z.ZodType {
  return baseEventSchema.extend({
    type: z.literal(eventType),
    payload: payloadSchema,
  });
}

export const runStartEventSchema = typedEventSchema('run.start', runStartPayloadSchema);
export const runEndEventSchema = typedEventSchema('run.end', runEndPayloadSchema);
export const runErrorEventSchema = typedEventSchema('run.error', runErrorPayloadSchema);
export const promptInputEventSchema = typedEventSchema('prompt.input', promptInputPayloadSchema);
export const promptOutputEventSchema = typedEventSchema('prompt.output', promptOutputPayloadSchema);
export const contextRetrievedEventSchema = typedEventSchema('context.retrieved', contextRetrievedPayloadSchema);
export const contextInjectedEventSchema = typedEventSchema('context.injected', contextInjectedPayloadSchema);
export const toolCallStartEventSchema = typedEventSchema('tool.call.start', toolCallStartPayloadSchema);
export const toolCallEndEventSchema = typedEventSchema('tool.call.end', toolCallEndPayloadSchema);
export const toolCallErrorEventSchema = typedEventSchema('tool.call.error', toolCallErrorPayloadSchema);
export const approvalRequestedEventSchema = typedEventSchema('approval.requested', approvalRequestedPayloadSchema);
export const approvalGrantedEventSchema = typedEventSchema('approval.granted', approvalGrantedPayloadSchema);
export const approvalDeniedEventSchema = typedEventSchema('approval.denied', approvalDeniedPayloadSchema);
export const sideEffectExecutedEventSchema = typedEventSchema('side_effect.executed', sideEffectExecutedPayloadSchema);
export const sideEffectFailedEventSchema = typedEventSchema('side_effect.failed', sideEffectFailedPayloadSchema);
export const modelRequestEventSchema = typedEventSchema('model.request', modelRequestPayloadSchema);
export const modelResponseEventSchema = typedEventSchema('model.response', modelResponsePayloadSchema);
export const policyEvaluatedEventSchema = typedEventSchema('policy.evaluated', policyEvaluatedPayloadSchema);
export const policyViolatedEventSchema = typedEventSchema('policy.violated', policyViolatedPayloadSchema);
export const annotationEventSchema = typedEventSchema('annotation', annotationPayloadSchema);
export const customEventSchema = typedEventSchema('custom', customPayloadSchema);

// ---------------------------------------------------------------------------
// Combined discriminated union schema
// ---------------------------------------------------------------------------

export const traceReplayEventSchema = z.discriminatedUnion('type', [
  baseEventSchema.extend({ type: z.literal('run.start'), payload: runStartPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('run.end'), payload: runEndPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('run.error'), payload: runErrorPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('prompt.input'), payload: promptInputPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('prompt.output'), payload: promptOutputPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('context.retrieved'), payload: contextRetrievedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('context.injected'), payload: contextInjectedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('tool.call.start'), payload: toolCallStartPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('tool.call.end'), payload: toolCallEndPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('tool.call.error'), payload: toolCallErrorPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('approval.requested'), payload: approvalRequestedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('approval.granted'), payload: approvalGrantedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('approval.denied'), payload: approvalDeniedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('side_effect.executed'), payload: sideEffectExecutedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('side_effect.failed'), payload: sideEffectFailedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('model.request'), payload: modelRequestPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('model.response'), payload: modelResponsePayloadSchema }),
  baseEventSchema.extend({ type: z.literal('policy.evaluated'), payload: policyEvaluatedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('policy.violated'), payload: policyViolatedPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('annotation'), payload: annotationPayloadSchema }),
  baseEventSchema.extend({ type: z.literal('custom'), payload: customPayloadSchema }),
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export type ValidationSuccess = { success: true; data: TraceReplayEvent };
export type ValidationFailure = { success: false; error: z.ZodError };
export type ValidationResult = ValidationSuccess | ValidationFailure;

/** Validate an unknown input against the full TraceReplay event schema. */
export function validateEvent(input: unknown): ValidationResult {
  const result = traceReplayEventSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as TraceReplayEvent };
  }
  return { success: false, error: result.error };
}

/** Type guard: checks if a string is a valid EventType. */
export function isValidEventType(type: string): type is EventType {
  return (EVENT_TYPES as readonly string[]).includes(type);
}

/** Create a minimal base event object for a given type (useful for testing). */
export function createBaseEvent(type: EventType, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: randomUUID(),
    runId: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    tenantId: 'tenant-default',
    sourceAgent: 'test-agent',
    payload,
    schemaVersion: SCHEMA_VERSION,
  };
}
