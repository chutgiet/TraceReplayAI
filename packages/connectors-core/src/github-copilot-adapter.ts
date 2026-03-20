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
// Type mapping — GitHub Copilot Agent → canonical
// ---------------------------------------------------------------------------

const TYPE_MAP = new Map<string, EventType>([
  ['copilot.session.start', 'run.start'],
  ['copilot.session.end', 'run.end'],
  ['copilot.session.error', 'run.error'],
  ['copilot.tool.invoke', 'tool.call.start'],
  ['copilot.tool.result', 'tool.call.end'],
  ['copilot.tool.error', 'tool.call.error'],
  ['copilot.completion.request', 'model.request'],
  ['copilot.completion.response', 'model.response'],
  ['copilot.message', 'prompt.output'],
]);

const TYPE_PATTERNS = [
  'copilot.',
] as const;

/**
 * GitHub Copilot uses camelCase field names and nests payload under `payload`.
 */
const COPILOT_FIELD_MAPPING: TraceFieldMapping = {
  type: 'type',
  traceId: 'sessionId',
  spanId: 'eventId',
  parentSpanId: 'parentEventId',
  timestamp: 'timestamp',
  agentName: 'agentName',
  dataField: 'payload',
};

// ---------------------------------------------------------------------------
// GitHub Copilot Adapter
// ---------------------------------------------------------------------------

/**
 * Maps GitHub Copilot agent trace events to canonical TraceReplay events.
 *
 * Extends {@link BaseAgentAdapter} — only the Copilot-specific type mapping,
 * field mapping, and payload construction live here.
 *
 * Mapping table:
 *   Copilot trace type            → Canonical event type
 *   copilot.session.start         → run.start
 *   copilot.session.end           → run.end
 *   copilot.session.error         → run.error
 *   copilot.tool.invoke           → tool.call.start
 *   copilot.tool.result           → tool.call.end
 *   copilot.tool.error            → tool.call.error
 *   copilot.completion.request    → model.request
 *   copilot.completion.response   → model.response
 *   copilot.message               → prompt.output
 */
export class GitHubCopilotAdapter extends BaseAgentAdapter {
  readonly vendorId = 'github-copilot';
  readonly displayName = 'GitHub Copilot';
  protected readonly sourceFramework = 'github-copilot';

  protected getTypePatterns(): readonly string[] {
    return TYPE_PATTERNS;
  }

  protected getFieldMapping(): TraceFieldMapping {
    return COPILOT_FIELD_MAPPING;
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
          errorType: stringField(data, 'errorType', 'type') ?? 'CopilotError',
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
          modelProvider: 'github',
          modelId: stringField(data, 'model', 'modelId') ?? 'unknown',
          inputTokens: numberField(data, 'inputTokens', 'promptTokens'),
          temperature: numberField(data, 'temperature'),
        };

      case 'model.response':
        return {
          modelProvider: 'github',
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

      default:
        return undefined;
    }
  }
}
