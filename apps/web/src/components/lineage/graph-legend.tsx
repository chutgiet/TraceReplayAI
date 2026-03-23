'use client';

import { cn } from '@/lib/utils';
import { getAllNodeVisuals, getAllEdgeVisuals } from './node-type-config';
import type { EdgeVisibility } from './use-lineage-graph';

export interface GraphLegendProps {
  edgeVisibility: EdgeVisibility;
  onEdgeVisibilityChange: (edgeType: string, visible: boolean) => void;
  className?: string;
}

/**
 * Legend showing node and edge types with toggleable edge visibility.
 */
export function GraphLegend({
  edgeVisibility,
  onEdgeVisibilityChange,
  className,
}: GraphLegendProps): React.JSX.Element {
  const nodeVisuals = getAllNodeVisuals();
  const edgeVisuals = getAllEdgeVisuals();

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm',
        className,
      )}
      role="region"
      aria-label="Graph legend"
    >
      <p className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]">
        Legend
      </p>

      {/* Node types */}
      <div className="mb-3 space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Nodes
        </p>
        {Object.entries(nodeVisuals).map(([type, visual]) => (
          <div key={type} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded text-xs',
                visual.bgColor,
                visual.borderColor,
                'border',
              )}
              aria-hidden="true"
            >
              {visual.icon}
            </span>
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {visual.label}
            </span>
          </div>
        ))}
      </div>

      {/* Edge types (toggleable) */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Edges
        </p>
        {Object.entries(edgeVisuals).map(([type, visual]) => (
          <label key={type} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={edgeVisibility[type] !== false}
              onChange={(e) => onEdgeVisibilityChange(type, e.target.checked)}
              className="h-3 w-3 rounded border-[var(--color-border)] accent-brand-500"
              aria-label={`Toggle ${visual.label} edges`}
            />
            <svg
              width="24"
              height="8"
              viewBox="0 0 24 8"
              className="shrink-0"
              aria-hidden="true"
            >
              <line
                x1="0"
                y1="4"
                x2="24"
                y2="4"
                stroke={visual.color}
                strokeWidth="2"
                strokeDasharray={visual.strokeDasharray ?? 'none'}
              />
            </svg>
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {visual.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
