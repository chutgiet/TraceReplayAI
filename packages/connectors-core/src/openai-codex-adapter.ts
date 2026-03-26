import type { EventType } from '@tracereplay/event-schema';
import {
  stringField,
  numberField,
  objectField,
  mapStatusToCanonical,
} from './adapter-utils.js';
import {
  BaseAgentAdapter,
  type VendorTraceEvent,
  type TraceFieldMapping,
} from './base-agent-adapter.js';

// ---------------------------------------------------------------------------
// Type mapping — OpenAI Codex IDE → canonical
// ---------------------------------------------------------------------------

const TYPE_MAP = new Map<string, EventType>([
  ['codex.session.start', 'run.start'],
  ['codex.session.end', 'run.end'],
  ['codex.session.error', 'run.error'],
  ['codex.tool.invoke', 'tool.call.start'],
  ['codex.tool.result', 'tool.call.end'],
  ['codex.tool.error', 'tool.call.error'],
  ['codex.completion.request', 'model.request'],
  ['codex.completion.response', 'model.response'],
  ['codex.message', 'prompt.output'],
  ['codex.prompt', 'prompt.input'],
  ['codex.approval.requested', 'approval.requested'],
  ['codex.approval.granted', 'approval.granted'],
  ['codex.approval.denied', 'approval.denied'],
  ['codex.context.injected', 'context.injected'],
  ['codex.side_effect', 'side_effect.executed'],
  ['codex.annotation', 'annotation'],
]);

const TYPE_PATTERNS = [
  'codex.',
] as const;

/**
 * Codex IDE uses the same field layout as the Copilot adapter
 * (sessionId-based, payload nested).
 */
const CODEX_FIELD_MAPPING: TraceFieldMapping = {
  type: 'type',
  traceId: 'sessionId',
  spanId: 'eventId',
  parentSpanId: 'parentEventId',
  timestamp: 'timestamp',
  agentName: 'agentName',
  dataField: 'data',
};

// ---------------------------------------------------------------------------
// OpenAI Codex IDE Adapter
// ---------------------------------------------------------------------------

/**
 * Maps OpenAI Codex IDE session events to canonical TraceReplay events.
 *
 * This adapter handles events from Codex IDE/CLI sessions routed through the
 * TraceReplay MCP server. It is separate from {@link OpenAIAgentsAdapter}
 * which handles the OpenAI Agents SDK trace format.
 *
 * Mapping table:
 *   Codex trace type                → Canonical event type
 *   codex.session.start             → run.start
 *   codex.session.end               → run.end
 *   codex.session.error             → run.error
 *   codex.tool.invoke               → tool.call.start
 *   codex.tool.result               → tool.call.end
 *   codex.tool.error                → tool.call.error
 *   codex.completion.request        → model.request
 *   codex.completion.response       → model.response
 *   codex.message                   → prompt.output
 *   codex.prompt                    → prompt.input
 *   codex.approval.requested        → approval.requested
 *   codex.approval.granted          → approval.granted
 *   codex.approval.denied           → approval.denied
 *   codex.context.injected          → context.injected
 *   codex.side_effect               → side_effect.executed
 *   codex.annotation                → annotation
 */
export class OpenAICodexAdapter extends BaseAgentAdapter {
  readonly vendorId = 'openai-codex';
  readonly displayName = 'OpenAI Codex IDE';
  protected readonly sourceFramework = 'openai-codex';

  protected getTypePatterns(): readonly string[] {
    return TYPE_PATTERNS;
  }

  protected getFieldMapping(): TraceFieldMapping {
    return CODEX_FIELD_MAPPING;
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
          runName: stringField(data, 'sessionName', 'name') ?? trace.agentName,
          triggerSource: 'agent',
          parentRunId: stringField(data, 'parentSessionId'),
          configuration: objectField(data, 'settings', 'config'),
        };

      case 'run.end':
        return {
          status: mapStatusToCanonical(stringField(data, 'status', 'outcome')),
          durationMs: numberField(data, 'durationMs', 'duration'),
          summary: stringField(data, 'summary'),
        };

      case 'run.error':
        return {
          errorType: stringField(data, 'errorType', 'type') ?? 'CodexError',
          errorMessage: stringField(data, 'errorMessage', 'message') ?? 'Unknown error',
          stackTrace: stringField(data, 'stackTrace', 'stack'),
        };

      case 'tool.call.start':
        return {
          toolName: stringField(data, 'toolName', 'name') ?? 'unknown',
          toolId: stringField(data, 'toolId', 'id'),
          inputParameters: objectField(data, 'parameters', 'input') ?? {},
        };

      case 'tool.call.end':
        return {
          toolName: stringField(data, 'toolName', 'name') ?? 'unknown',
          toolId: stringField(data, 'toolId', 'id'),
          output: data['output'] ?? data['result'],
          durationMs: numberField(data, 'durationMs', 'duration'),
          success: data['error'] == null,
        };

      case 'tool.call.error':
        return {
          toolName: stringField(data, 'toolName', 'name') ?? 'unknown',
          toolId: stringField(data, 'toolId', 'id'),
          errorType: stringField(data, 'errorType') ?? 'ToolCallError',
          errorMessage: stringField(data, 'errorMessage', 'message') ?? 'Unknown error',
        };

      case 'model.request':
        return {
          modelProvider: 'openai',
          modelId: stringField(data, 'model', 'modelId') ?? 'unknown',
          inputTokens: numberField(data, 'inputTokens', 'promptTokens'),
          temperature: numberField(data, 'temperature'),
        };

      case 'model.response':
        return {
          modelProvider: 'openai',
          modelId: stringField(data, 'model', 'modelId') ?? 'unknown',
          outputTokens: numberField(data, 'outputTokens', 'completionTokens'),
          inputTokens: numberField(data, 'inputTokens', 'promptTokens'),
          latencyMs: numberField(data, 'latencyMs', 'duration'),
          cost: numberField(data, 'cost'),
        };

      case 'prompt.output':
        return {
          content: stringField(data, 'content', 'text') ?? '',
          tokenCount: numberField(data, 'tokenCount', 'outputTokens'),
          finishReason: stringField(data, 'finishReason', 'stopReason'),
          modelId: stringField(data, 'model', 'modelId'),
        };

      case 'prompt.input':
        return {
          role: stringField(data, 'role') ?? 'user',
          content: stringField(data, 'content', 'text') ?? '',
          tokenCount: numberField(data, 'tokenCount'),
        };

      case 'approval.requested':
        return {
          approvalType: stringField(data, 'approvalType') ?? 'unknown',
          requestedAction: stringField(data, 'requestedAction', 'action') ?? 'unknown',
          requestedBy: stringField(data, 'requestedBy') ?? 'codex',
          context: objectField(data, 'context'),
        };

      case 'approval.granted':
        return {
          approvalType: stringField(data, 'approvalType') ?? 'unknown',
          decidedBy: stringField(data, 'decidedBy') ?? 'user',
          reason: stringField(data, 'reason'),
        };

      case 'approval.denied':
        return {
          approvalType: stringField(data, 'approvalType') ?? 'unknown',
          decidedBy: stringField(data, 'decidedBy') ?? 'user',
          reason: stringField(data, 'reason'),
        };

      case 'context.injected':
        return {
          source: stringField(data, 'source') ?? 'unknown',
          tokenCount: numberField(data, 'tokenCount'),
          content: stringField(data, 'content'),
        };

      case 'side_effect.executed':
        return {
          effectType: stringField(data, 'effectType') ?? 'unknown',
          targetSystem: stringField(data, 'targetSystem') ?? 'unknown',
          description: stringField(data, 'description') ?? '',
          reversible: (data['reversible'] as boolean) ?? false,
          metadata: objectField(data, 'metadata'),
        };

      case 'annotation':
        return {
          key: stringField(data, 'key') ?? 'unknown',
          value: data['value'],
          annotatedBy: stringField(data, 'annotatedBy') ?? 'codex',
        };

      default:
        return undefined;
    }
  }
}
