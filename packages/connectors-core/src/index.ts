// Types and interfaces
export type {
  RawVendorEvent,
  NormalizationSuccess,
  NormalizationError,
  NormalizationResult,
  NormalizerAdapter,
} from './types.js';

// Adapter registry
export { AdapterRegistry } from './types.js';

// Shared utilities
export {
  stringField,
  numberField,
  objectField,
  toEventId,
  toRunId,
  toTenantId,
  isoTimestamp,
  mapStatusToCanonical,
  mapPolicyResult,
  createCanonicalEvent,
  type BaseEventFields,
} from './adapter-utils.js';

// Base adapter
export { BaseAgentAdapter } from './base-agent-adapter.js';
export type {
  VendorTraceEvent,
  TraceFieldMapping,
} from './base-agent-adapter.js';
export { DEFAULT_FIELD_MAPPING } from './base-agent-adapter.js';

// Built-in adapters
export { PassthroughAdapter } from './passthrough-adapter.js';
export { OpenAIAgentsAdapter } from './openai-agents-adapter.js';
export { OpenAICodexAdapter } from './openai-codex-adapter.js';
export { GitHubCopilotAdapter } from './github-copilot-adapter.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
