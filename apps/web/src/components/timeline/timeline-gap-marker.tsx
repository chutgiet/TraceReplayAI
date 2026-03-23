'use client';

import { cn } from '@/lib/utils';
import type { TimelineGap } from '@/lib/api';

export interface TimelineGapMarkerProps {
  gap: TimelineGap;
  className?: string;
}

const GAP_ICONS: Record<string, string> = {
  missing_run_start: '⚠',
  missing_run_end: '⚠',
  orphan_tool_end: '⚠',
  unclosed_tool_call: '⏳',
  unclosed_approval: '⏳',
};

/** Renders a visual marker for a detected gap in the timeline. */
export function TimelineGapMarker({
  gap,
  className,
}: TimelineGapMarkerProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border border-dashed border-amber-400 bg-amber-50 px-4 py-2 dark:border-amber-600 dark:bg-amber-950',
        className,
      )}
      role="alert"
      aria-label={`Timeline gap: ${gap.message}`}
    >
      <span className="text-base" aria-hidden="true">
        {GAP_ICONS[gap.type] ?? '⚠'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
          {gapTypeLabel(gap.type)}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {gap.message}
        </p>
      </div>
    </div>
  );
}

function gapTypeLabel(type: string): string {
  switch (type) {
    case 'missing_run_start': return 'Missing Run Start';
    case 'missing_run_end': return 'Missing Run End';
    case 'orphan_tool_end': return 'Orphan Tool End';
    case 'unclosed_tool_call': return 'Unclosed Tool Call';
    case 'unclosed_approval': return 'Unclosed Approval';
    default: return 'Timeline Gap';
  }
}
