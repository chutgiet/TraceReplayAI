import type { EventType } from './types.js';

/** Current canonical event schema version. */
export const SCHEMA_VERSION = '1.0.0' as const;

/** All valid event type discriminators, ordered by category. */
export const EVENT_TYPES: readonly EventType[] = [
  // Run lifecycle
  'run.start',
  'run.end',
  'run.error',
  // Prompt telemetry
  'prompt.input',
  'prompt.output',
  // Context
  'context.retrieved',
  'context.injected',
  // Tool calls
  'tool.call.start',
  'tool.call.end',
  'tool.call.error',
  // Approvals
  'approval.requested',
  'approval.granted',
  'approval.denied',
  // Side effects
  'side_effect.executed',
  'side_effect.failed',
  // Model interactions
  'model.request',
  'model.response',
  // Policy
  'policy.evaluated',
  'policy.violated',
  // Other
  'annotation',
  'custom',
] as const;

/** Valid statuses for `run.end` events. */
export const RUN_STATUSES = ['success', 'failure', 'timeout', 'cancelled'] as const;

/** Valid prompt roles. */
export const PROMPT_ROLES = ['system', 'user', 'assistant', 'tool'] as const;

/** Common approval types. */
export const APPROVAL_TYPES = ['human', 'system', 'policy'] as const;

/** Common side-effect types. */
export const SIDE_EFFECT_TYPES = ['api_call', 'db_write', 'email', 'file_write', 'message'] as const;

/** Common model providers. */
export const MODEL_PROVIDERS = ['openai', 'anthropic', 'azure', 'local'] as const;

/** Known trigger sources. */
export const TRIGGER_SOURCES = ['api', 'schedule', 'user', 'agent'] as const;

/** Known context retrieval sources. */
export const CONTEXT_SOURCES = ['vector_db', 'api', 'file', 'web'] as const;

/** Policy evaluation results. */
export const POLICY_RESULTS = ['pass', 'warn', 'fail'] as const;
