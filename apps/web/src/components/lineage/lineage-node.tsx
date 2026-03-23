'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { LineageNodeData } from './types';
import { getNodeTypeVisual, getEventNodeVisual } from './node-type-config';

/**
 * Custom React Flow node for lineage graph visualization.
 * Renders different styles based on node type (run, event, side_effect, external_system).
 */
function LineageNodeComponent({ data, selected }: NodeProps & { data: LineageNodeData }) {
  const baseVisual = getNodeTypeVisual(data.nodeType);
  const eventVisual = data.eventType ? getEventNodeVisual(data.eventType) : null;

  // Use event-specific visual for event nodes, base visual for others
  const visual = eventVisual
    ? { ...baseVisual, ...eventVisual }
    : baseVisual;

  return (
    <div
      className={cn(
        'rounded-lg border-2 px-3 py-2 shadow-sm transition-shadow',
        visual.bgColor,
        visual.borderColor,
        visual.textColor,
        selected && 'ring-2 ring-brand-500 ring-offset-1 shadow-md',
      )}
      role="button"
      tabIndex={0}
      aria-label={`${data.nodeType}: ${data.label}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-none !bg-[var(--color-text-muted)]"
      />

      <div className="flex items-center gap-2 overflow-hidden">
        <span className="shrink-0 text-sm" aria-hidden="true">
          {visual.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold leading-tight">
            {data.label}
          </p>
          <p className="truncate text-[10px] leading-tight opacity-70">
            {formatNodeSubtitle(data)}
          </p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-none !bg-[var(--color-text-muted)]"
      />
    </div>
  );
}

function formatNodeSubtitle(data: LineageNodeData): string {
  switch (data.nodeType) {
    case 'run':
      return `${data.meta.status ?? 'running'} · ${data.meta.agentId ?? ''}`;
    case 'event':
      return data.eventType ?? 'event';
    case 'side_effect':
      return `${data.meta.effectType ?? ''} → ${data.meta.targetSystem ?? ''}`;
    case 'external_system':
      return `${data.meta.effectCount ?? 0} effect(s)`;
    default:
      return '';
  }
}

export const LineageNodeComponent_Memo = memo(LineageNodeComponent);
export { LineageNodeComponent };
