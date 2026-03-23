'use client';

import { cn } from '@/lib/utils';
import { formatTimestamp, formatDuration } from '@/lib/utils';
import type { LineageNodeData } from './types';

export interface NodeDetailPanelProps {
  data: LineageNodeData;
  onClose: () => void;
  className?: string;
}

/**
 * Side panel showing details for a selected graph node.
 */
export function NodeDetailPanel({
  data,
  onClose,
  className,
}: NodeDetailPanelProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-md',
        className,
      )}
      role="region"
      aria-label="Node detail"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {data.label}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {data.nodeType}
            {data.eventType ? ` · ${data.eventType}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          aria-label="Close node detail"
        >
          ✕
        </button>
      </div>

      {/* Metadata fields */}
      <div className="space-y-2">
        {data.sourceEventId && (
          <MetaRow label="Event ID" value={data.sourceEventId} mono />
        )}
        {data.runId && (
          <MetaRow label="Run ID" value={data.runId} mono />
        )}
        {renderTypeSpecificFields(data)}
      </div>
    </div>
  );
}

function renderTypeSpecificFields(data: LineageNodeData): React.JSX.Element | null {
  const meta = data.meta;

  switch (data.nodeType) {
    case 'run':
      return (
        <>
          {meta.agentId && <MetaRow label="Agent" value={String(meta.agentId)} />}
          {meta.status && <MetaRow label="Status" value={String(meta.status)} />}
          {meta.triggerSource && <MetaRow label="Trigger" value={String(meta.triggerSource)} />}
          {meta.startTime && <MetaRow label="Started" value={formatTimestamp(String(meta.startTime))} />}
          {meta.endTime && <MetaRow label="Ended" value={formatTimestamp(String(meta.endTime))} />}
          {meta.durationMs != null && <MetaRow label="Duration" value={formatDuration(Number(meta.durationMs))} />}
          {meta.parentRunId && <MetaRow label="Parent Run" value={String(meta.parentRunId)} mono />}
        </>
      );

    case 'event':
      return (
        <>
          {meta.sourceAgent && <MetaRow label="Source Agent" value={String(meta.sourceAgent)} />}
          {meta.sourceFramework && <MetaRow label="Framework" value={String(meta.sourceFramework)} />}
          {meta.timestamp && <MetaRow label="Timestamp" value={formatTimestamp(String(meta.timestamp))} />}
          {meta.sequence != null && <MetaRow label="Sequence" value={String(meta.sequence)} />}
        </>
      );

    case 'side_effect':
      return (
        <>
          {meta.effectType && <MetaRow label="Effect Type" value={String(meta.effectType)} />}
          {meta.targetSystem && <MetaRow label="Target System" value={String(meta.targetSystem)} />}
          {meta.description && <MetaRow label="Description" value={String(meta.description)} />}
          <MetaRow label="Reversible" value={meta.reversible ? 'Yes' : 'No'} />
          <MetaRow label="Success" value={meta.success ? 'Yes' : 'No'} />
          {meta.errorMessage && <MetaRow label="Error" value={String(meta.errorMessage)} />}
        </>
      );

    case 'external_system':
      return (
        <>
          {meta.systemName && <MetaRow label="System" value={String(meta.systemName)} />}
          {meta.effectCount != null && <MetaRow label="Effect Count" value={String(meta.effectCount)} />}
        </>
      );

    default:
      return null;
  }
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className={cn('text-xs text-[var(--color-text-primary)]', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
