'use client';

import { cn } from '@/lib/utils';
import type { TimelineEntry } from '@/lib/api';

export interface TimelineDurationBarProps {
  /** Duration of this entry in milliseconds. */
  durationMs: number | undefined;
  /** Total run duration in milliseconds — used for proportional width. */
  totalDurationMs: number | undefined;
  /** Tailwind color class for the bar fill. */
  barColor: string;
  className?: string;
}

/**
 * Proportional duration bar for a timeline entry.
 * Width is relative to the total run duration.
 */
export function TimelineDurationBar({
  durationMs,
  totalDurationMs,
  barColor,
  className,
}: TimelineDurationBarProps): React.JSX.Element | null {
  if (durationMs == null || !totalDurationMs || totalDurationMs <= 0) {
    return null;
  }

  // Clamp between 2% and 100% for visibility
  const pct = Math.min(100, Math.max(2, (durationMs / totalDurationMs) * 100));

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      aria-label={`Duration: ${formatDurationCompact(durationMs)}`}
    >
      <div className="h-1.5 flex-1 rounded-full bg-[var(--color-surface-overlay)]">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
        {formatDurationCompact(durationMs)}
      </span>
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

/**
 * Computes the maximum "meaningful" duration for scaling all bars.
 * Uses the total run duration, falling back to the max entry duration.
 */
export function computeMaxDuration(
  entries: TimelineEntry[],
  totalDurationMs: number | undefined,
): number | undefined {
  if (totalDurationMs && totalDurationMs > 0) return totalDurationMs;

  let max = 0;
  for (const entry of entries) {
    if (entry.durationMs != null && entry.durationMs > max) {
      max = entry.durationMs;
    }
  }
  return max > 0 ? max : undefined;
}
