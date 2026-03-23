'use client';

import { cn } from '@/lib/utils';
import type { TimelineEntry } from '@/lib/api';
import { getEventTypeConfig, getEventSummary } from './event-type-config';
import { TimelineDurationBar } from './timeline-duration-bar';

export interface TimelineEntryRowProps {
  entry: TimelineEntry;
  /** Total run duration for proportional bar rendering. */
  maxDurationMs: number | undefined;
  /** Whether this entry is currently selected/expanded. */
  isSelected: boolean;
  /** Callback when the entry is clicked. */
  onSelect: (entry: TimelineEntry) => void;
}

/** A single row in the vertical timeline representing one event. */
export function TimelineEntryRow({
  entry,
  maxDurationMs,
  isSelected,
  onSelect,
}: TimelineEntryRowProps): React.JSX.Element {
  const config = getEventTypeConfig(entry.event.type);
  const summary = getEventSummary(entry.event.type, entry.event.payload);
  const time = formatTimeOnly(entry.event.timestamp);

  return (
    <button
      type="button"
      className={cn(
        'group relative flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors',
        config.borderColor,
        isSelected
          ? 'bg-[var(--color-surface-raised)] ring-1 ring-inset ring-[var(--color-border)]'
          : 'hover:bg-[var(--color-surface-raised)]',
      )}
      style={{ paddingLeft: `${1 + entry.depth * 1.5}rem` }}
      onClick={() => onSelect(entry)}
      aria-expanded={isSelected}
      aria-label={`${config.label}: ${summary}`}
    >
      {/* Timeline node/dot */}
      <div className="relative flex shrink-0 flex-col items-center pt-0.5">
        <div
          className={cn('h-3 w-3 rounded-full ring-2 ring-[var(--color-surface)]', config.dotColor)}
          aria-hidden="true"
        />
        {/* Vertical connector line */}
        <div
          className="absolute top-4 h-full w-px bg-[var(--color-border)]"
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Top row: type badge + timestamp */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
              config.bgColor,
            )}
          >
            <span aria-hidden="true">{config.icon}</span>
            {config.label}
          </span>
          <span className="text-[10px] tabular-nums text-[var(--color-text-muted)]">
            {time}
          </span>
          {entry.event.sequence != null && (
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              #{entry.event.sequence}
            </span>
          )}
        </div>

        {/* Summary */}
        <p className="truncate text-xs text-[var(--color-text-secondary)]">
          {summary}
        </p>

        {/* Duration bar */}
        {entry.durationMs != null && (
          <TimelineDurationBar
            durationMs={entry.durationMs}
            totalDurationMs={maxDurationMs}
            barColor={config.barColor}
            className="max-w-xs"
          />
        )}
      </div>

      {/* Agent label */}
      <span className="hidden shrink-0 text-[10px] text-[var(--color-text-muted)] sm:block">
        {entry.event.sourceAgent}
      </span>
    </button>
  );
}

function formatTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}
