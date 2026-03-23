'use client';

import { cn, formatDuration } from '@/lib/utils';
import type { RunSummary } from '@/lib/api';
import { Badge } from '@tracereplay/ui';

export interface RunSummaryHeaderProps {
  summary: RunSummary;
  gapCount: number;
  className?: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'info' | 'muted'> = {
  success: 'success',
  failure: 'error',
  timeout: 'warning',
  cancelled: 'muted',
};

/** Compact run summary bar displayed above the timeline. */
export function RunSummaryHeader({
  summary,
  gapCount,
  className,
}: RunSummaryHeaderProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3',
        className,
      )}
    >
      {/* Status */}
      {summary.status && (
        <SummaryItem label="Status">
          <Badge variant={STATUS_VARIANT[summary.status] ?? 'default'}>
            {summary.status}
          </Badge>
        </SummaryItem>
      )}

      {/* Event count */}
      <SummaryItem label="Events">
        <span className="text-sm font-medium tabular-nums">
          {summary.eventCount}
        </span>
      </SummaryItem>

      {/* Duration */}
      <SummaryItem label="Duration">
        <span className="text-sm font-medium tabular-nums">
          {formatDuration(summary.durationMs)}
        </span>
      </SummaryItem>

      {/* Tools */}
      <SummaryItem label="Tools">
        <span className="text-sm font-medium tabular-nums">
          {summary.toolCount}
        </span>
      </SummaryItem>

      {/* Errors indicator */}
      {summary.hasErrors && (
        <Badge variant="error">Errors detected</Badge>
      )}

      {/* Gaps indicator */}
      {gapCount > 0 && (
        <Badge variant="warning">
          {gapCount} {gapCount === 1 ? 'gap' : 'gaps'}
        </Badge>
      )}
    </div>
  );
}

function SummaryItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[var(--color-text-muted)]">{label}:</span>
      {children}
    </div>
  );
}
