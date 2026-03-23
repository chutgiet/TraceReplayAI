'use client';

import { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TimelineEntry } from '@/lib/api';
import { JsonViewer, Badge, TimeDisplay } from '@tracereplay/ui';
import { getEventTypeConfig } from './event-type-config';

export interface EventDetailPanelProps {
  entry: TimelineEntry;
  onClose: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Redacted field detection
// ---------------------------------------------------------------------------

const REDACTED_SENTINEL = '[REDACTED]';

/** Recursively finds field paths in `obj` whose values are the redacted sentinel. */
export function findRedactedFields(
  obj: unknown,
  prefix = '',
): string[] {
  if (obj === null || obj === undefined || typeof obj !== 'object') return [];
  const result: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === REDACTED_SENTINEL) {
      result.push(path);
    } else if (typeof value === 'object' && value !== null) {
      result.push(...findRedactedFields(value, path));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Type-specific structured payload rendering
// ---------------------------------------------------------------------------

interface StructuredField {
  label: string;
  value: string | number | boolean | null | undefined;
  variant?: 'default' | 'code' | 'badge-success' | 'badge-error' | 'badge-info';
}

/**
 * Extracts human-readable structured fields from an event payload
 * based on the event type. Returns an empty array for unrecognised types.
 */
export function extractStructuredFields(
  type: string,
  payload: Record<string, unknown>,
): StructuredField[] {
  const fields: StructuredField[] = [];

  const push = (
    label: string,
    value: unknown,
    variant?: StructuredField['variant'],
  ) => {
    if (value !== undefined && value !== null && value !== '') {
      fields.push({ label, value: value as string | number | boolean, variant });
    }
  };

  switch (type) {
    case 'run.start':
      push('Run Name', payload.runName);
      push('Trigger', payload.triggerSource, 'badge-info');
      push('Parent Run', payload.parentRunId, 'code');
      break;
    case 'run.end':
      push('Status', payload.status, payload.status === 'success' ? 'badge-success' : 'badge-error');
      push('Duration', payload.durationMs != null ? formatDurationCompact(payload.durationMs as number) : null);
      push('Summary', payload.summary);
      break;
    case 'run.error':
      push('Error Type', payload.errorType, 'badge-error');
      push('Message', payload.errorMessage);
      push('Fatal', payload.fatal, typeof payload.fatal === 'boolean' && payload.fatal ? 'badge-error' : 'badge-info');
      break;
    case 'prompt.input':
    case 'prompt.output':
      push('Role', payload.role, 'badge-info');
      push('Token Count', payload.tokenCount);
      push('Model', payload.modelId, 'code');
      push('Finish Reason', payload.finishReason);
      break;
    case 'tool.call.start':
      push('Tool', payload.toolName, 'code');
      push('Tool ID', payload.toolId, 'code');
      break;
    case 'tool.call.end':
      push('Tool', payload.toolName, 'code');
      push('Success', payload.success, payload.success ? 'badge-success' : 'badge-error');
      push('Duration', payload.durationMs != null ? formatDurationCompact(payload.durationMs as number) : null);
      break;
    case 'tool.call.error':
      push('Tool', payload.toolName, 'code');
      push('Error Type', payload.errorType, 'badge-error');
      push('Message', payload.errorMessage);
      break;
    case 'context.retrieved':
      push('Source', payload.source, 'badge-info');
      push('Snippets', payload.snippetCount);
      push('Query', payload.query);
      break;
    case 'context.injected':
      push('Source', payload.source, 'badge-info');
      break;
    case 'approval.requested':
      push('Type', payload.approvalType, 'badge-info');
      push('Action', payload.requestedAction);
      push('Requested By', payload.requestedBy);
      break;
    case 'approval.granted':
    case 'approval.denied':
      push('Type', payload.approvalType, 'badge-info');
      push('Decided By', payload.decidedBy);
      push('Reason', payload.reason);
      break;
    case 'side_effect.executed':
    case 'side_effect.failed':
      push('Effect Type', payload.effectType, 'badge-info');
      push('Description', payload.description);
      break;
    case 'model.request':
    case 'model.response':
      push('Provider', payload.modelProvider, 'badge-info');
      push('Model', payload.modelId, 'code');
      push('Latency', payload.latencyMs != null ? formatDurationCompact(payload.latencyMs as number) : null);
      break;
    case 'policy.evaluated':
    case 'policy.violated':
      push('Policy', payload.policyName ?? payload.policyId, 'code');
      push('Result', payload.result);
      break;
  }

  return fields;
}

// ---------------------------------------------------------------------------
// EventDetailPanel component
// ---------------------------------------------------------------------------

/** Expandable detail panel for a selected timeline event. */
export function EventDetailPanel({
  entry,
  onClose,
  className,
}: EventDetailPanelProps): React.JSX.Element {
  const config = getEventTypeConfig(entry.event.type);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(entry.event.id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  }, [entry.event.id]);

  const handleCopyJson = useCallback(() => {
    const json = JSON.stringify(entry.event, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    });
  }, [entry.event]);

  const redactedFields = useMemo(
    () => findRedactedFields(entry.event.payload),
    [entry.event.payload],
  );

  const structuredFields = useMemo(
    () => extractStructuredFields(entry.event.type, entry.event.payload),
    [entry.event.type, entry.event.payload],
  );

  const hasTags = entry.event.tags && Object.keys(entry.event.tags).length > 0;

  return (
    <div
      className={cn(
        'animate-slide-in-right rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
      role="region"
      aria-label="Event detail"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold',
              config.bgColor,
            )}
          >
            <span aria-hidden="true">{config.icon}</span>
            {config.label}
          </span>
          <button
            type="button"
            onClick={handleCopyId}
            className="font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
            title="Copy event ID"
            aria-label="Copy event ID"
          >
            {copiedId ? 'Copied!' : entry.event.id.slice(0, 8) + '…'}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyJson}
            className="rounded px-2 py-1 text-[10px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
            aria-label="Copy event JSON"
          >
            {copiedJson ? 'Copied!' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
            aria-label="Close event detail"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Redacted field indicator */}
      {redactedFields.length > 0 && (
        <div
          className="flex items-start gap-2 border-b border-[var(--color-border)] bg-amber-50 px-4 py-2 dark:bg-amber-950"
          role="status"
          aria-label="Redacted fields warning"
        >
          <span className="mt-0.5 text-amber-500" aria-hidden="true">🔒</span>
          <div>
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {redactedFields.length} redacted {redactedFields.length === 1 ? 'field' : 'fields'}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
              {redactedFields.join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-4 py-3">
        <MetaField label="Timestamp">
          <TimeDisplay timestamp={entry.event.timestamp} format="full" className="text-xs" />
        </MetaField>
        <MetaField label="Sequence">
          <span className="font-mono text-xs">
            {entry.event.sequence != null ? `#${entry.event.sequence}` : '—'}
          </span>
        </MetaField>
        <MetaField label="Source Agent">
          <span className="text-xs">{entry.event.sourceAgent}</span>
        </MetaField>
        <MetaField label="Framework">
          <span className="text-xs">{entry.event.sourceFramework ?? '—'}</span>
        </MetaField>
        {entry.event.parentEventId && (
          <MetaField label="Parent Event">
            <span className="font-mono text-xs">{entry.event.parentEventId.slice(0, 8)}…</span>
          </MetaField>
        )}
        {entry.durationMs != null && (
          <MetaField label="Duration">
            <Badge variant="info">{formatDurationCompact(entry.durationMs)}</Badge>
          </MetaField>
        )}
        {entry.childEventIds.length > 0 && (
          <MetaField label="Children">
            <span className="text-xs">{entry.childEventIds.length} child event(s)</span>
          </MetaField>
        )}
        <MetaField label="Depth">
          <span className="text-xs">{entry.depth}</span>
        </MetaField>
        <MetaField label="Schema Version">
          <span className="font-mono text-xs">{entry.event.schemaVersion}</span>
        </MetaField>
      </div>

      {/* Type-specific structured fields */}
      {structuredFields.length > 0 && (
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            Details
          </p>
          <div className="space-y-1.5">
            {structuredFields.map((field) => (
              <div key={field.label} className="flex items-baseline gap-2">
                <span className="shrink-0 text-[10px] font-medium text-[var(--color-text-muted)]">
                  {field.label}
                </span>
                <StructuredValue field={field} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {hasTags && (
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(entry.event.tags).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {key}{value ? `: ${value}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Payload */}
      <div className="px-4 py-3">
        <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
          Payload
        </p>
        <JsonViewer data={entry.event.payload} defaultExpandDepth={2} />
      </div>

      {/* Raw metadata (if present) */}
      {entry.event.rawMeta && Object.keys(entry.event.rawMeta).length > 0 && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
            Raw Metadata
          </p>
          <JsonViewer data={entry.event.rawMeta} defaultExpandDepth={1} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[var(--color-text-muted)]">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StructuredValue({ field }: { field: StructuredField }): React.JSX.Element {
  const displayValue = String(field.value);

  switch (field.variant) {
    case 'code':
      return (
        <span className="truncate rounded bg-[var(--color-surface-raised)] px-1 py-0.5 font-mono text-xs text-[var(--color-text-secondary)]">
          {displayValue}
        </span>
      );
    case 'badge-success':
      return <Badge variant="success">{displayValue}</Badge>;
    case 'badge-error':
      return <Badge variant="error">{displayValue}</Badge>;
    case 'badge-info':
      return <Badge variant="info">{displayValue}</Badge>;
    default:
      return <span className="truncate text-xs text-[var(--color-text-secondary)]">{displayValue}</span>;
  }
}

function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
