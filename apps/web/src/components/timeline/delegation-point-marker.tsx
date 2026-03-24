'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DelegationPoint } from '@/lib/api';

export interface DelegationPointMarkerProps {
  delegationPoint: DelegationPoint;
  className?: string;
}

const STATUS_DOT_COLOR: Record<string, string> = {
  success: 'bg-green-500',
  failure: 'bg-red-500',
  timeout: 'bg-amber-500',
  cancelled: 'bg-slate-400',
  running: 'bg-blue-500',
};

/**
 * Inline marker in the timeline showing a sub-agent delegation point.
 * Links to the child run for drill-down.
 */
export function DelegationPointMarker({
  delegationPoint,
  className,
}: DelegationPointMarkerProps): React.JSX.Element {
  const { childRunId, childAgentId, childRunName, childStatus } = delegationPoint;
  const dotColor = STATUS_DOT_COLOR[childStatus] ?? 'bg-slate-400';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border border-violet-300 bg-violet-50 px-4 py-2 dark:border-violet-700 dark:bg-violet-950',
        className,
      )}
      role="status"
      aria-label={`Sub-agent delegation to ${childAgentId}`}
    >
      {/* Delegation icon */}
      <span className="text-violet-600 dark:text-violet-400" aria-hidden="true">
        ↳
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            Sub-agent delegation
          </span>
          <span
            className={cn('inline-block h-2 w-2 rounded-full', dotColor)}
            aria-hidden="true"
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {childStatus}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
          {childRunName ?? childAgentId} →{' '}
          <Link
            href={`/runs/${childRunId}`}
            className="font-mono underline hover:text-violet-600 dark:hover:text-violet-400"
          >
            {childRunId.slice(0, 8)}…
          </Link>
        </p>
      </div>

      {/* Navigate to child run */}
      <Link
        href={`/runs/${childRunId}`}
        className="shrink-0 rounded-md border border-violet-300 px-2 py-1 text-[10px] font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-600 dark:text-violet-300 dark:hover:bg-violet-900"
      >
        View run →
      </Link>
    </div>
  );
}
