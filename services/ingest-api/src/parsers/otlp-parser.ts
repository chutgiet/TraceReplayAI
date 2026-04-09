/**
 * OTLP JSON parser — converts OpenTelemetry ExportTraceServiceRequest (JSON)
 * into flat span records suitable for enqueuing as RawVendorEvents.
 *
 * Follows the OTLP/HTTP JSON specification:
 *   https://opentelemetry.io/docs/specs/otlp/#otlphttp
 *
 * The parser handles the nested resource → scope → span hierarchy and flattens
 * each span into an independent record carrying its resource and scope context.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// OTLP JSON schema (Zod) — ExportTraceServiceRequest
// ---------------------------------------------------------------------------

const otlpKeyValueSchema = z.object({
  key: z.string(),
  value: z.record(z.unknown()).optional(),
});

const otlpResourceSchema = z.object({
  attributes: z.array(otlpKeyValueSchema).optional().default([]),
  droppedAttributesCount: z.number().optional(),
});

const otlpInstrumentationScopeSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  attributes: z.array(otlpKeyValueSchema).optional().default([]),
});

const otlpStatusSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
});

const otlpEventSchema = z.object({
  name: z.string().optional(),
  timeUnixNano: z.string().optional(),
  attributes: z.array(otlpKeyValueSchema).optional().default([]),
  droppedAttributesCount: z.number().optional(),
});

const otlpLinkSchema = z.object({
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  traceState: z.string().optional(),
  attributes: z.array(otlpKeyValueSchema).optional().default([]),
  droppedAttributesCount: z.number().optional(),
});

const otlpSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional().default(''),
  name: z.string(),
  kind: z.number().optional(),
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string().optional().default(''),
  attributes: z.array(otlpKeyValueSchema).optional().default([]),
  droppedAttributesCount: z.number().optional(),
  events: z.array(otlpEventSchema).optional().default([]),
  droppedEventsCount: z.number().optional(),
  links: z.array(otlpLinkSchema).optional().default([]),
  droppedLinksCount: z.number().optional(),
  status: otlpStatusSchema.optional(),
  traceState: z.string().optional(),
});

const otlpScopeSpansSchema = z.object({
  scope: otlpInstrumentationScopeSchema.optional(),
  spans: z.array(otlpSpanSchema).optional().default([]),
  schemaUrl: z.string().optional(),
});

const otlpResourceSpansSchema = z.object({
  resource: otlpResourceSchema.optional(),
  scopeSpans: z.array(otlpScopeSpansSchema).optional().default([]),
  schemaUrl: z.string().optional(),
});

export const exportTraceServiceRequestSchema = z.object({
  resourceSpans: z.array(otlpResourceSpansSchema).optional().default([]),
});

export type ExportTraceServiceRequest = z.infer<typeof exportTraceServiceRequestSchema>;

// ---------------------------------------------------------------------------
// Flattened span — the output of the parser
// ---------------------------------------------------------------------------

export interface OtlpFlatSpan {
  /** Hex trace ID (16 or 32 chars). */
  traceId: string;
  /** Hex span ID (16 chars). */
  spanId: string;
  /** Hex parent span ID (empty string if root). */
  parentSpanId: string;
  /** Span operation name (e.g. "invoke_agent", "chat", "execute_tool"). */
  name: string;
  /** Span kind integer (0=unspecified, 1=internal, 2=server, 3=client, 4=producer, 5=consumer). */
  kind: number;
  /** Nanosecond Unix timestamp as string. */
  startTimeUnixNano: string;
  /** Nanosecond Unix timestamp as string (may be empty). */
  endTimeUnixNano: string;
  /** Span-level attributes as a flat key→value map. */
  attributes: Record<string, unknown>;
  /** Span status. */
  status: { code?: number; message?: string };
  /** Span events (e.g. exceptions, log messages). */
  events: Array<{
    name: string;
    timeUnixNano: string;
    attributes: Record<string, unknown>;
  }>;
  /** Span links. */
  links: Array<{
    traceId: string;
    spanId: string;
    attributes: Record<string, unknown>;
  }>;
  /** Resource attributes from the enclosing ResourceSpans. */
  resourceAttributes: Record<string, unknown>;
  /** Instrumentation scope name (e.g. "@opentelemetry/instrumentation-copilot"). */
  scopeName: string;
  /** Instrumentation scope version. */
  scopeVersion: string;
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the primitive value from an OTLP AnyValue object.
 * OTLP JSON encodes attribute values as `{ stringValue: "…" }`,
 * `{ intValue: 42 }`, `{ boolValue: true }`, etc.
 */
function extractAnyValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value['stringValue'];
  if ('intValue' in value) return typeof value['intValue'] === 'string' ? parseInt(value['intValue'] as string, 10) : value['intValue'];
  if ('doubleValue' in value) return value['doubleValue'];
  if ('boolValue' in value) return value['boolValue'];
  if ('bytesValue' in value) return value['bytesValue'];
  if ('arrayValue' in value) {
    const arr = value['arrayValue'] as { values?: Array<Record<string, unknown>> };
    return arr?.values?.map(extractAnyValue) ?? [];
  }
  if ('kvlistValue' in value) {
    const kvlist = value['kvlistValue'] as { values?: Array<{ key: string; value?: Record<string, unknown> }> };
    return attributesToMap(kvlist?.values ?? []);
  }
  return undefined;
}

/**
 * Converts an array of OTLP KeyValue objects to a flat key→value map.
 */
function attributesToMap(
  attrs: Array<{ key: string; value?: Record<string, unknown> }>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const attr of attrs) {
    map[attr.key] = extractAnyValue(attr.value);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Vendor detection
// ---------------------------------------------------------------------------

/**
 * Detect the vendor identifier from resource attributes.
 * Falls back to "otel-genai" if no recognized service name is found.
 */
export function detectVendor(resourceAttributes: Record<string, unknown>): string {
  const serviceName = resourceAttributes['service.name'];
  if (typeof serviceName === 'string') {
    const lower = serviceName.toLowerCase();
    if (lower.includes('copilot')) return 'otel-copilot';
    if (lower.includes('codex')) return 'otel-codex';
    if (lower.includes('claude')) return 'otel-claude';
    if (lower.includes('cursor')) return 'otel-cursor';
  }
  return 'otel-genai';
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

export interface OtlpParseResult {
  spans: OtlpFlatSpan[];
  spanCount: number;
  resourceCount: number;
}

/**
 * Parse a validated ExportTraceServiceRequest into flat span records.
 */
export function parseOtlpTraces(request: ExportTraceServiceRequest): OtlpParseResult {
  const spans: OtlpFlatSpan[] = [];

  for (const resourceSpan of request.resourceSpans) {
    const resourceAttrs = attributesToMap(resourceSpan.resource?.attributes ?? []);

    for (const scopeSpan of resourceSpan.scopeSpans) {
      const scopeName = scopeSpan.scope?.name ?? '';
      const scopeVersion = scopeSpan.scope?.version ?? '';

      for (const span of scopeSpan.spans) {
        const spanAttrs = attributesToMap(span.attributes);

        const flatSpan: OtlpFlatSpan = {
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          kind: span.kind ?? 0,
          startTimeUnixNano: span.startTimeUnixNano,
          endTimeUnixNano: span.endTimeUnixNano,
          attributes: spanAttrs,
          status: {
            code: span.status?.code,
            message: span.status?.message,
          },
          events: span.events.map((e) => ({
            name: e.name ?? '',
            timeUnixNano: e.timeUnixNano ?? '',
            attributes: attributesToMap(e.attributes),
          })),
          links: span.links.map((l) => ({
            traceId: l.traceId ?? '',
            spanId: l.spanId ?? '',
            attributes: attributesToMap(l.attributes),
          })),
          resourceAttributes: resourceAttrs,
          scopeName,
          scopeVersion,
        };

        spans.push(flatSpan);
      }
    }
  }

  return {
    spans,
    spanCount: spans.length,
    resourceCount: request.resourceSpans.length,
  };
}

// ---------------------------------------------------------------------------
// Span → RawVendorEvent mapping
// ---------------------------------------------------------------------------

export interface SpanAsRawEvent {
  vendor: string;
  data: Record<string, unknown>;
  receivedAt: string;
  tenantId: string;
  runId: string;
}

/**
 * Convert nanosecond Unix timestamp string to ISO 8601.
 * Returns current time if the input is empty or invalid.
 */
function nanoToIso(nanoStr: string): string {
  if (!nanoStr) return new Date().toISOString();
  const ms = Math.floor(Number(BigInt(nanoStr) / BigInt(1_000_000)));
  const d = new Date(ms);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Maps a flat OTLP span to a RawVendorEvent suitable for the normalization queue.
 *
 * The entire span structure (attributes, events, links, resource attributes)
 * is preserved in `data` so the downstream OTelSpanAdapter can perform
 * rich GenAI semantic convention mapping.
 */
export function spanToRawEvent(
  span: OtlpFlatSpan,
  tenantId: string,
  receivedAt: string,
): SpanAsRawEvent {
  const vendor = detectVendor(span.resourceAttributes);

  return {
    vendor,
    data: {
      // Span identity & hierarchy
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind,

      // Timestamps
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.endTimeUnixNano,
      startTime: nanoToIso(span.startTimeUnixNano),
      endTime: span.endTimeUnixNano ? nanoToIso(span.endTimeUnixNano) : undefined,

      // Attributes (merged for easy access by adapters)
      attributes: span.attributes,
      resourceAttributes: span.resourceAttributes,

      // Status
      status: span.status,

      // Events & links
      events: span.events,
      links: span.links,

      // Scope
      scopeName: span.scopeName,
      scopeVersion: span.scopeVersion,
    },
    receivedAt,
    tenantId,
    runId: span.traceId,
  };
}
