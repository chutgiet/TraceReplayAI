import type { EventType } from '@tracereplay/event-schema';
import {
  stringField,
  numberField,
  objectField,
  mapStatusToCanonical,
  mapPolicyResult,
} from './adapter-utils.js';
import { BaseAgentAdapter, type VendorTraceEvent } from './base-agent-adapter.js';

// ---------------------------------------------------------------------------
// Type mapping — OpenAI Agents SDK → canonical
// ---------------------------------------------------------------------------

const TYPE_MAP = new Map<string, EventType>([
  ['agent.start', 'run.start'],
  ['agent.end', 'run.end'],
  ['tool_call.start', 'tool.call.start'],
  ['tool_call.end', 'tool.call.end'],
  ['tool_call.error', 'tool.call.error'],
  ['generation.start', 'model.request'],
  ['generation.end', 'model.response'],
  ['handoff', 'custom'],
  ['guardrail.start', 'policy.evaluated'],
  ['guardrail.end', 'policy.evaluated'],
  ['response.output_text', 'prompt.output'],
]);

const TYPE_PATTERNS = [
  'agent.',
  'tool_call.',
  'generation.',
  'guardrail.',
  'handoff',
  'response.output_text',
] as const;

// ---------------------------------------------------------------------------
// OpenAI Agents Adapter
// ---------------------------------------------------------------------------

/**
 * Maps OpenAI Agents SDK trace events to canonical TraceReplay events.
 *
 * Extends {@link BaseAgentAdapter} — only the vendor-specific type mapping
 * and payload construction live here. All boilerplate (error handling, base
 * field assembly, rawMeta, canHandle) is in the base class.
 *
 * Mapping table:
 *   OpenAI trace type       → Canonical event type
 *   agent.start             → run.start
 *   agent.end               → run.end
 *   tool_call.start         → tool.call.start
 *   tool_call.end           → tool.call.end
 *   tool_call.error         → tool.call.error
 *   generation.start        → model.request
 *   generation.end          → model.response
 *   handoff                 → custom (with customType "handoff")
 *   guardrail.start         → policy.evaluated
 *   guardrail.end           → policy.evaluated
 *   response.output_text    → prompt.output
 */
export class OpenAIAgentsAdapter extends BaseAgentAdapter {
  readonly vendorId = 'openai-agents';
  readonly displayName = 'OpenAI Agents SDK';
  protected readonly sourceFramework = 'openai-agents';

  protected getTypePatterns(): readonly string[] {
    return TYPE_PATTERNS;
  }

  protected resolveCanonicalType(vendorType: string): EventType | undefined {
    return TYPE_MAP.get(vendorType);
  }

  protected buildPayload(
    canonicalType: EventType,
    vendorType: string,
    data: Record<string, unknown>,
    trace: VendorTraceEvent,
  ): Record<string, unknown> | undefined {
    switch (canonicalType) {
      case 'run.start':
        return {
          runName: stringField(data, 'name') ?? trace.agentName,
          triggerSource: 'agent',
          parentRunId: stringField(data, 'parent_run_id'),
          configuration: objectField(data, 'config'),
        };

      case 'run.end':
        return {
          status: mapStatusToCanonical(stringField(data, 'status')),
          durationMs: numberField(data, 'duration_ms'),
          summary: stringField(data, 'summary'),
        };

      case 'tool.call.start':
        return {
          toolName: stringField(data, 'name', 'tool_name') ?? 'unknown',
          toolId: stringField(data, 'tool_call_id', 'id'),
          inputParameters: objectField(data, 'arguments', 'input') ?? {},
        };

      case 'tool.call.end':
        return {
          toolName: stringField(data, 'name', 'tool_name') ?? 'unknown',
          toolId: stringField(data, 'tool_call_id', 'id'),
          output: data['output'] ?? data['result'],
          durationMs: numberField(data, 'duration_ms'),
          success: data['error'] == null,
        };

      case 'tool.call.error':
        return {
          toolName: stringField(data, 'name', 'tool_name') ?? 'unknown',
          toolId: stringField(data, 'tool_call_id', 'id'),
          errorType: stringField(data, 'error_type') ?? 'ToolCallError',
          errorMessage: stringField(data, 'error_message', 'error') ?? 'Unknown error',
        };

      case 'model.request':
        return {
          modelProvider: 'openai',
          modelId: stringField(data, 'model') ?? 'unknown',
          inputTokens: numberField(data, 'input_tokens', 'prompt_tokens'),
          temperature: numberField(data, 'temperature'),
        };

      case 'model.response':
        return {
          modelProvider: 'openai',
          modelId: stringField(data, 'model') ?? 'unknown',
          outputTokens: numberField(data, 'output_tokens', 'completion_tokens'),
          inputTokens: numberField(data, 'input_tokens', 'prompt_tokens'),
          latencyMs: numberField(data, 'duration_ms', 'latency_ms'),
          cost: numberField(data, 'cost'),
        };

      case 'custom':
        return vendorType === 'handoff'
          ? {
              customType: 'handoff',
              targetAgent: stringField(data, 'target_agent', 'to_agent'),
              sourceAgent: stringField(data, 'source_agent', 'from_agent'),
              reason: stringField(data, 'reason'),
            }
          : undefined;

      case 'policy.evaluated':
        return {
          policyId: stringField(data, 'guardrail_id', 'id') ?? 'unknown',
          policyName: stringField(data, 'guardrail_name', 'name') ?? 'unknown',
          result: mapPolicyResult(stringField(data, 'result', 'status')),
          details: stringField(data, 'details', 'message'),
        };

      case 'prompt.output':
        return {
          content: stringField(data, 'text', 'content') ?? '',
          tokenCount: numberField(data, 'token_count', 'output_tokens'),
          finishReason: stringField(data, 'finish_reason'),
          modelId: stringField(data, 'model'),
        };

      default:
        return undefined;
    }
  }
}
