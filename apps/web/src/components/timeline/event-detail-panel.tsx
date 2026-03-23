'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TimelineEntry } from '@/lib/api';
import { JsonViewer, Badge, TimeDisplay } from '@tracereplay/ui';
import { getEventTypeConfig } from './event-type-config';

export interface EventDetailPanelProps {
  entry: TimelineEntry;
  onClose: () => void;
  className?: string;
}

/** Expandable detail panel for a selected timeline event. */
export function EventDetailPanel({
  entry,
  onClose,
  className,
}: EventDetailPanelProps): React.JSX.Element {
  const config = getEventTypeConfig(entry.event.type);
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(entry.event.id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  }, [entry.event.id]);

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
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
          >
            {copiedId ? 'Copied!' : entry.event.id.slice(0, 8) + '…'}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
          aria-label="Close event detail"
        >
          ✕
        </button>
      </div>

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
      </div>

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

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[var(--color-text-muted)]">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function formatDurationCompact(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
