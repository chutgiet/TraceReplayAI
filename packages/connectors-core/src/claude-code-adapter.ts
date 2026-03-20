import type { EventType } from '@tracereplay/event-schema';
import {
  stringField,
  numberField,
  objectField,
  mapStatusToCanonical,
  mapPolicyResult,
} from './adapter-utils.js';
import {
  BaseAgentAdapter,
  type VendorTraceEvent,
  type TraceFieldMapping,
} from './base-agent-adapter.js';

// ---------------------------------------------------------------------------
// Type mapping — Claude Code Agent → canonical
// ---------------------------------------------------------------------------

const TYPE_MAP = new Map<string, EventType>([
  ['conversation.start', 'run.start'],
  ['conversation.end', 'run.end'],
  ['conversation.error', 'run.error'],
  ['tool_use.begin', 'tool.call.start'],
  ['tool_use.complete', 'tool.call.end'],
  ['tool_use.failed', 'tool.call.error'],
  ['inference.request', 'model.request'],
  ['inference.response', 'model.response'],
  ['assistant.message', 'prompt.output'],
  ['permission.check', 'policy.evaluated'],
]);

const TYPE_PATTERNS = [
  'conversation.',
  'tool_use.',
  'inference.',
  'assistant.',
  'permission.',
] as const;

/**
 * Claude Code uses snake_case fields with slightly different names.
 */
const CLAUDE_FIELD_MAPPING: TraceFieldMapping = {
  type: 'type',
  traceId: 'conversation_id',
  spanId: 'event_id',
  parentSpanId: 'parent_event_id',
  timestamp: 'timestamp',
  agentName: 'agent',
  dataField: 'content',
};

// ---------------------------------------------------------------------------
// Claude Code Adapter
// ---------------------------------------------------------------------------

/**
 * Maps Anthropic Claude Code agent trace events to canonical TraceReplay events.
 *
 * Extends {@link BaseAgentAdapter} — only the Claude-specific type mapping,
 * field mapping, and payload construction live here.
 *
 * Mapping table:
 *   Claude trace type         → Canonical event type
 *   conversation.start        → run.start
 *   conversation.end          → run.end
 *   conversation.error        → run.error
 *   tool_use.begin            → tool.call.start
 *   tool_use.complete         → tool.call.end
 *   tool_use.failed           → tool.call.error
 *   inference.request         → model.request
 *   inference.response        → model.response
 *   assistant.message         → prompt.output
 *   permission.check          → policy.evaluated
 */
export class ClaudeCodeAdapter extends BaseAgentAdapter {
  readonly vendorId = 'claude-code';
  readonly displayName = 'Claude Code';
  protected readonly sourceFramework = 'claude-code';

  protected getTypePatterns(): readonly string[] {
    return TYPE_PATTERNS;
  }

  protected getFieldMapping(): TraceFieldMapping {
    return CLAUDE_FIELD_MAPPING;
  }

  protected resolveCanonicalType(vendorType: string): EventType | undefined {
    return TYPE_MAP.get(vendorType);
  }

  protected buildPayload(
    canonicalType: EventType,
    _vendorType: string,
    data: Record<string, unknown>,
    trace: VendorTraceEvent,
  ): Record<string, unknown> | undefined {
    switch (canonicalType) {
      case 'run.start':
        return {
          runName: stringField(data, 'conversation_name', 'title') ?? trace.agentName,
          triggerSource: 'agent',
          parentRunId: stringField(data, 'parent_conversation_id'),
          configuration: objectField(data, 'config', 'settings'),
        };

      case 'run.end':
        return {
          status: mapStatusToCanonical(stringField(data, 'status', 'outcome')),
          durationMs: numberField(data, 'duration_ms', 'elapsed_ms'),
          summary: stringField(data, 'summary'),
        };

      case 'run.error':
        return {
          errorType: stringField(data, 'error_type', 'kind') ?? 'ClaudeCodeError',
          errorMessage: stringField(data, 'error_message', 'message') ?? 'Unknown error',
          stackTrace: stringField(data, 'stack_trace'),
        };

      case 'tool.call.start':
        return {
          toolName: stringField(data, 'tool_name', 'name') ?? 'unknown',
          toolId: stringField(data, 'tool_use_id', 'id'),
          inputParameters: objectField(data, 'input', 'parameters') ?? {},
        };

      case 'tool.call.end':
        return {
          toolName: stringField(data, 'tool_name', 'name') ?? 'unknown',
          toolId: stringField(data, 'tool_use_id', 'id'),
          output: data['output'] ?? data['result'],
          durationMs: numberField(data, 'duration_ms', 'elapsed_ms'),
          success: data['error'] == null && data['is_error'] !== true,
        };

      case 'tool.call.error':
        return {
          toolName: stringField(data, 'tool_name', 'name') ?? 'unknown',
          toolId: stringField(data, 'tool_use_id', 'id'),
          errorType: stringField(data, 'error_type', 'kind') ?? 'ToolCallError',
          errorMessage: stringField(data, 'error_message', 'message') ?? 'Unknown error',
        };

      case 'model.request':
        return {
          modelProvider: 'anthropic',
          modelId: stringField(data, 'model', 'model_id') ?? 'unknown',
          inputTokens: numberField(data, 'input_tokens', 'prompt_tokens'),
          temperature: numberField(data, 'temperature'),
        };

      case 'model.response':
        return {
          modelProvider: 'anthropic',
          modelId: stringField(data, 'model', 'model_id') ?? 'unknown',
          outputTokens: numberField(data, 'output_tokens', 'completion_tokens'),
          inputTokens: numberField(data, 'input_tokens', 'prompt_tokens'),
          latencyMs: numberField(data, 'latency_ms', 'duration_ms'),
          cost: numberField(data, 'cost'),
        };

      case 'prompt.output':
        return {
          content: stringField(data, 'text', 'message') ?? '',
          tokenCount: numberField(data, 'token_count', 'output_tokens'),
          finishReason: stringField(data, 'stop_reason', 'finish_reason'),
          modelId: stringField(data, 'model'),
        };

      case 'policy.evaluated':
        return {
          policyId: stringField(data, 'permission_id', 'check_id') ?? 'unknown',
          policyName: stringField(data, 'permission_name', 'check_name') ?? 'unknown',
          result: mapPolicyResult(stringField(data, 'result', 'decision')),
          details: stringField(data, 'details', 'reason'),
        };

      default:
        return undefined;
    }
  }
}
