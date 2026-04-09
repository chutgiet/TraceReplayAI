/**
 * OTel Span → Canonical Event Adapter
 *
 * Maps OpenTelemetry spans following GenAI Semantic Conventions to
 * TraceReplay canonical events. A single OTel span typically produces
 * a start + end event pair (e.g. `invoke_agent` → `run.start` + `run.end`).
 *
 * Handles all OTel vendor variants: otel-genai, otel-copilot, otel-codex,
 * otel-claude, otel-cursor. The adapter is registered under `otel-genai`
 * and uses `canHandle()` probing for other OTel vendor IDs.
 *
 * Input shape: `RawVendorEvent.data` as produced by `spanToRawEvent()` in
 * `services/ingest-api/src/parsers/otlp-parser.ts`:
 *   { traceId, spanId, parentSpanId, name, kind, startTimeUnixNano,
 *     endTimeUnixNano, startTime, endTime, attributes, resourceAttributes,
 *     status, events, links, scopeName, scopeVersion }
 *
 * Span name mapping:
 *   invoke_agent  → run.start + run.end  (+ run.error on ERROR status)
 *   chat          → model.request + model.response
 *   execute_tool  → tool.call.start + tool.call.end (+ tool.call.error)
 *   (unknown)     → annotation
 */

import { randomUUID } from 'node:crypto';
import type { EventType, TraceReplayEvent } from '@tracereplay/event-schema';
import type {
  NormalizerAdapter,
  NormalizationResult,
  RawVendorEvent,
} from './types.js';
import {
  toEventId,
  toRunId,
  toTenantId,
  isoTimestamp,
  createCanonicalEvent,
  type BaseEventFields,
} from './adapter-utils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OTel StatusCode.ERROR */
const OTEL_STATUS_ERROR = 2;

/** All vendor IDs produced by the OTLP parser's `detectVendor()`. */
const OTEL_VENDOR_IDS = new Set([
  'otel-genai',
  'otel-copilot',
  'otel-codex',
  'otel-claude',
  'otel-cursor',
]);

/** Vendor → default model provider mapping. */
const VENDOR_PROVIDER_MAP: Record<string, string> = {
  'otel-copilot': 'openai',
  'otel-codex': 'openai',
  'otel-claude': 'anthropic',
  'otel-cursor': 'openai',
  'otel-genai': 'unknown',
};

// ---------------------------------------------------------------------------
// Span name classification
// ---------------------------------------------------------------------------

type SpanCategory = 'agent' | 'chat' | 'tool';

function classifySpanName(name: string): SpanCategory | undefined {
  const lower = name.toLowerCase();

  // Agent spans
  if (lower === 'invoke_agent' || lower.includes('agent.invoke') || lower.includes('agent.run')) {
    return 'agent';
  }

  // Chat / LLM inference spans
  if (
    lower === 'chat' ||
    lower === 'inference' ||
    lower.includes('chat.completion') ||
    lower.includes('llm.')
  ) {
    return 'chat';
  }

  // Tool execution spans
  if (
    lower === 'execute_tool' ||
    lower.includes('tool.execute') ||
    lower.includes('tool.call')
  ) {
    return 'tool';
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// OTelSpanAdapter
// ---------------------------------------------------------------------------

export class OTelSpanAdapter implements NormalizerAdapter {
  readonly vendorId = 'otel-genai';
  readonly displayName = 'OpenTelemetry GenAI';

  private readonly sourceFramework = 'opentelemetry';

  // -----------------------------------------------------------------------
  // NormalizerAdapter interface
  // -----------------------------------------------------------------------

  canHandle(raw: RawVendorEvent): boolean {
    if (OTEL_VENDOR_IDS.has(raw.vendor)) return true;

    // Probe for OTel span data shape
    const d = raw.data;
    return (
      typeof d['name'] === 'string' &&
      typeof d['traceId'] === 'string' &&
      typeof d['spanId'] === 'string' &&
      d['attributes'] != null &&
      typeof d['attributes'] === 'object'
    );
  }

  normalize(raw: RawVendorEvent): NormalizationResult {
    try {
      const data = raw.data;
      const spanName = data['name'];

      if (typeof spanName !== 'string') {
        return {
          status: 'error',
          reason: 'Missing "name" field in OTel span data',
          rawEvent: raw,
        };
      }

      const events = this.mapSpanToEvents(data, raw);

      if (!events || events.length === 0) {
        return {
          status: 'error',
          reason: `Unsupported OTel span name: ${spanName}`,
          rawEvent: raw,
        };
      }

      return { status: 'success', events };
    } catch (err) {
      return {
        status: 'error',
        reason: `OTelSpanAdapter error: ${err instanceof Error ? err.message : String(err)}`,
        rawEvent: raw,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Span routing
  // -----------------------------------------------------------------------

  private mapSpanToEvents(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    const spanName = data['name'] as string;
    const attrs = getAttributes(data);

    // 1. Classify by span name
    const category = classifySpanName(spanName);
    if (category) {
      return this.dispatchCategory(category, data, raw);
    }

    // 2. Fall back to attribute hints
    if (attrs['gen_ai.request.model'] || attrs['gen_ai.response.model']) {
      return this.mapChatSpan(data, raw);
    }
    if (attrs['gen_ai.tool.name']) {
      return this.mapToolSpan(data, raw);
    }

    // 3. Unmapped span → annotation
    return this.mapAnnotationSpan(data, raw);
  }

  private dispatchCategory(
    category: SpanCategory,
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    switch (category) {
      case 'agent':
        return this.mapAgentSpan(data, raw);
      case 'chat':
        return this.mapChatSpan(data, raw);
      case 'tool':
        return this.mapToolSpan(data, raw);
    }
  }

  // -----------------------------------------------------------------------
  // invoke_agent → run.start + run.end [+ run.error]
  // -----------------------------------------------------------------------

  private mapAgentSpan(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    const base = this.buildBaseFields(data, raw);
    const attrs = getAttributes(data);
    const resourceAttrs = getResourceAttributes(data);
    const events: TraceReplayEvent[] = [];

    // run.start
    events.push(
      createCanonicalEvent(
        'run.start',
        {
          runName: getAgentName(attrs, resourceAttrs) ?? (data['name'] as string),
          triggerSource: 'agent',
          parentRunId: undefined,
          configuration: extractConfiguration(attrs, resourceAttrs),
        },
        { ...base, timestamp: getStartTime(data) },
        { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
      ),
    );

    // run.end (only when the span has an end timestamp)
    if (hasEndTime(data)) {
      const endBase: BaseEventFields = {
        ...base,
        id: toEventId(randomUUID()),
        timestamp: getEndTime(data),
        parentEventId: base.id,
      };
      const isError = isErrorStatus(data);

      events.push(
        createCanonicalEvent(
          'run.end',
          {
            status: isError ? 'failure' : 'success',
            durationMs: computeDurationMs(data),
            summary: typeof attrs['gen_ai.agent.description'] === 'string'
              ? attrs['gen_ai.agent.description']
              : undefined,
          },
          endBase,
          { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
        ),
      );

      // run.error when status code is ERROR
      if (isError) {
        events.push(this.buildErrorEvent('run.error', data, raw, base));
      }
    }

    return events;
  }

  // -----------------------------------------------------------------------
  // chat → model.request + model.response
  // -----------------------------------------------------------------------

  private mapChatSpan(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    const base = this.buildBaseFields(data, raw);
    const attrs = getAttributes(data);
    const resourceAttrs = getResourceAttributes(data);
    const events: TraceReplayEvent[] = [];

    const modelId = strAttr(attrs, 'gen_ai.request.model', 'gen_ai.response.model') ?? 'unknown';
    const modelProvider = detectModelProvider(raw.vendor, resourceAttrs);

    // model.request
    events.push(
      createCanonicalEvent(
        'model.request',
        {
          modelProvider,
          modelId,
          inputTokens: numAttr(attrs, 'gen_ai.usage.input_tokens', 'gen_ai.usage.prompt_tokens'),
          temperature: numAttr(attrs, 'gen_ai.request.temperature'),
        },
        { ...base, timestamp: getStartTime(data) },
        { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
      ),
    );

    // model.response (only when the span has an end timestamp)
    if (hasEndTime(data)) {
      const responseBase: BaseEventFields = {
        ...base,
        id: toEventId(randomUUID()),
        timestamp: getEndTime(data),
        parentEventId: base.id,
      };

      events.push(
        createCanonicalEvent(
          'model.response',
          {
            modelProvider,
            modelId,
            inputTokens: numAttr(attrs, 'gen_ai.usage.input_tokens', 'gen_ai.usage.prompt_tokens'),
            outputTokens: numAttr(attrs, 'gen_ai.usage.output_tokens', 'gen_ai.usage.completion_tokens'),
            latencyMs: computeDurationMs(data),
            cost: numAttr(attrs, 'gen_ai.usage.cost'),
          },
          responseBase,
          { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
        ),
      );
    }

    return events;
  }

  // -----------------------------------------------------------------------
  // execute_tool → tool.call.start + tool.call.end [+ tool.call.error]
  // -----------------------------------------------------------------------

  private mapToolSpan(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    const base = this.buildBaseFields(data, raw);
    const attrs = getAttributes(data);
    const events: TraceReplayEvent[] = [];

    const toolName = strAttr(attrs, 'gen_ai.tool.name', 'tool.name')
      ?? (data['name'] as string)
      ?? 'unknown';
    const toolId = strAttr(attrs, 'gen_ai.tool.id', 'tool.id');

    // tool.call.start
    events.push(
      createCanonicalEvent(
        'tool.call.start',
        {
          toolName,
          toolId,
          inputParameters: extractToolInput(attrs),
        },
        { ...base, timestamp: getStartTime(data) },
        { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
      ),
    );

    // tool.call.end (only when the span has an end timestamp)
    if (hasEndTime(data)) {
      const isError = isErrorStatus(data);
      const endBase: BaseEventFields = {
        ...base,
        id: toEventId(randomUUID()),
        timestamp: getEndTime(data),
        parentEventId: base.id,
      };

      events.push(
        createCanonicalEvent(
          'tool.call.end',
          {
            toolName,
            toolId,
            output: attrs['gen_ai.tool.output'] ?? attrs['tool.output'] ?? undefined,
            durationMs: computeDurationMs(data),
            success: !isError,
          },
          endBase,
          { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel'] },
        ),
      );

      // tool.call.error when status code is ERROR
      if (isError) {
        events.push(this.buildToolErrorEvent(toolName, toolId, data, raw, base));
      }
    }

    return events;
  }

  // -----------------------------------------------------------------------
  // Unknown span → annotation
  // -----------------------------------------------------------------------

  private mapAnnotationSpan(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): TraceReplayEvent[] {
    const base = this.buildBaseFields(data, raw);

    return [
      createCanonicalEvent(
        'annotation',
        {
          key: 'otel.span',
          value: {
            name: data['name'],
            kind: data['kind'],
            attributes: getAttributes(data),
          },
          annotatedBy: this.sourceFramework,
        },
        { ...base, timestamp: getStartTime(data) },
        { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel', 'unmapped'] },
      ),
    ];
  }

  // -----------------------------------------------------------------------
  // Error event builders
  // -----------------------------------------------------------------------

  private buildErrorEvent(
    type: 'run.error',
    data: Record<string, unknown>,
    raw: RawVendorEvent,
    base: BaseEventFields,
  ): TraceReplayEvent {
    const status = data['status'] as { code?: number; message?: string } | undefined;

    return createCanonicalEvent(
      type,
      {
        errorType: 'SpanError',
        errorMessage: status?.message || 'OTel span ended with ERROR status',
        stackTrace: extractExceptionStackTrace(data),
        fatal: false,
      },
      {
        ...base,
        id: toEventId(randomUUID()),
        timestamp: getEndTime(data),
        parentEventId: base.id,
      },
      { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel', 'error'] },
    );
  }

  private buildToolErrorEvent(
    toolName: string,
    toolId: string | undefined,
    data: Record<string, unknown>,
    raw: RawVendorEvent,
    base: BaseEventFields,
  ): TraceReplayEvent {
    const status = data['status'] as { code?: number; message?: string } | undefined;

    return createCanonicalEvent(
      'tool.call.error',
      {
        toolName,
        toolId,
        errorType: 'ToolCallError',
        errorMessage: status?.message || 'OTel tool span ended with ERROR status',
      },
      {
        ...base,
        id: toEventId(randomUUID()),
        timestamp: getEndTime(data),
        parentEventId: base.id,
      },
      { sourceFramework: this.sourceFramework, tags: [raw.vendor, 'otel', 'error'] },
    );
  }

  // -----------------------------------------------------------------------
  // Base field assembly
  // -----------------------------------------------------------------------

  private buildBaseFields(
    data: Record<string, unknown>,
    raw: RawVendorEvent,
  ): BaseEventFields {
    const attrs = getAttributes(data);
    const resourceAttrs = getResourceAttributes(data);
    const agentName = getAgentName(attrs, resourceAttrs) ?? `${raw.vendor}-agent`;

    return {
      id: toEventId(data['spanId'] as string),
      runId: toRunId(raw.runId ?? (data['traceId'] as string)),
      tenantId: toTenantId(raw.tenantId),
      timestamp: getStartTime(data),
      sourceAgent: agentName,
      parentEventId:
        data['parentSpanId'] && data['parentSpanId'] !== ''
          ? toEventId(data['parentSpanId'] as string)
          : undefined,
      rawMeta: {
        normalizedBy: 'otel-genai',
        receivedAt: raw.receivedAt,
        originalSpanName: data['name'],
        traceId: data['traceId'],
        spanId: data['spanId'],
        vendor: raw.vendor,
        scopeName: data['scopeName'],
        scopeVersion: data['scopeVersion'],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helper functions (module-private)
// ---------------------------------------------------------------------------

function getAttributes(data: Record<string, unknown>): Record<string, unknown> {
  return (data['attributes'] as Record<string, unknown>) ?? {};
}

function getResourceAttributes(data: Record<string, unknown>): Record<string, unknown> {
  return (data['resourceAttributes'] as Record<string, unknown>) ?? {};
}

function getStartTime(data: Record<string, unknown>): string {
  return isoTimestamp(data['startTime'] as string | undefined);
}

function getEndTime(data: Record<string, unknown>): string {
  return isoTimestamp(data['endTime'] as string | undefined);
}

function hasEndTime(data: Record<string, unknown>): boolean {
  return !!(data['endTime'] || data['endTimeUnixNano']);
}

function getAgentName(
  attrs: Record<string, unknown>,
  resourceAttrs: Record<string, unknown>,
): string | undefined {
  const agent = attrs['gen_ai.agent.name'];
  if (typeof agent === 'string') return agent;
  const service = resourceAttrs['service.name'];
  if (typeof service === 'string') return service;
  return undefined;
}

function isErrorStatus(data: Record<string, unknown>): boolean {
  const status = data['status'] as { code?: number; message?: string } | undefined;
  return status?.code === OTEL_STATUS_ERROR;
}

function computeDurationMs(data: Record<string, unknown>): number | undefined {
  const startNano = data['startTimeUnixNano'] as string | undefined;
  const endNano = data['endTimeUnixNano'] as string | undefined;
  if (!startNano || !endNano) return undefined;

  try {
    const durationNs = BigInt(endNano) - BigInt(startNano);
    return Number(durationNs / BigInt(1_000_000));
  } catch {
    return undefined;
  }
}

function detectModelProvider(
  vendor: string,
  resourceAttrs: Record<string, unknown>,
): string {
  const serviceName = resourceAttrs['service.name'];
  if (typeof serviceName === 'string') {
    const lower = serviceName.toLowerCase();
    if (lower.includes('openai') || lower.includes('copilot') || lower.includes('codex')) return 'openai';
    if (lower.includes('anthropic') || lower.includes('claude')) return 'anthropic';
    if (lower.includes('google') || lower.includes('gemini')) return 'google';
  }
  return VENDOR_PROVIDER_MAP[vendor] ?? 'unknown';
}

function strAttr(
  attrs: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = attrs[key];
    if (typeof val === 'string') return val;
  }
  return undefined;
}

function numAttr(
  attrs: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const val = attrs[key];
    if (typeof val === 'number') return val;
  }
  return undefined;
}

function extractToolInput(attrs: Record<string, unknown>): Record<string, unknown> {
  const input = attrs['gen_ai.tool.input'] ?? attrs['tool.input'];
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  // Collect gen_ai.tool.* attributes (excluding name/id) as input parameters
  const toolParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (
      key.startsWith('gen_ai.tool.') &&
      key !== 'gen_ai.tool.name' &&
      key !== 'gen_ai.tool.id' &&
      key !== 'gen_ai.tool.output'
    ) {
      toolParams[key.replace('gen_ai.tool.', '')] = value;
    }
  }
  return Object.keys(toolParams).length > 0 ? toolParams : {};
}

function extractConfiguration(
  attrs: Record<string, unknown>,
  resourceAttrs: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};

  if (typeof resourceAttrs['service.version'] === 'string') {
    config['serviceVersion'] = resourceAttrs['service.version'];
  }
  if (typeof resourceAttrs['session.id'] === 'string') {
    config['sessionId'] = resourceAttrs['session.id'];
  }
  if (typeof attrs['gen_ai.agent.description'] === 'string') {
    config['agentDescription'] = attrs['gen_ai.agent.description'];
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function extractExceptionStackTrace(data: Record<string, unknown>): string | undefined {
  const events = data['events'] as
    | Array<{ name: string; attributes: Record<string, unknown> }>
    | undefined;
  if (!events) return undefined;

  const exception = events.find((e) => e.name === 'exception');
  if (!exception) return undefined;

  const st = exception.attributes['exception.stacktrace'];
  return typeof st === 'string' ? st : undefined;
}
