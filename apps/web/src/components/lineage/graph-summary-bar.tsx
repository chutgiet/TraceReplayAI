'use client';

import { cn } from '@/lib/utils';
import type { LineageGraph } from '@tracereplay/graph-model';

export interface GraphSummaryBarProps {
  graph: LineageGraph;
  className?: string;
}

/**
 * Compact stats bar showing graph summary metrics.
 */
export function GraphSummaryBar({
  graph,
  className,
}: GraphSummaryBarProps): React.JSX.Element {
  const { summary } = graph;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2 text-xs',
        className,
      )}
      role="region"
      aria-label="Graph summary"
    >
      <Stat label="Nodes" value={summary.nodeCount} />
      <Stat label="Edges" value={summary.edgeCount} />
      <Stat label="Events" value={summary.nodeTypeCounts.event} />
      <Stat label="Side Effects" value={summary.sideEffectCount} />
      <Stat label="External Systems" value={summary.externalSystemCount} />
      <Stat label="Max Depth" value={summary.maxCausalDepth} />
      {summary.hasDelegation && (
        <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-200">
          Sub-agent delegation
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--color-text-primary)]">
        {value}
      </span>
    </div>
  );
}
