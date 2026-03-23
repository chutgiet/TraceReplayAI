'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import type { LineageEdgeData } from './types';
import { getEdgeTypeVisual } from './node-type-config';

/**
 * Custom edge component for lineage graph.
 * Renders different stroke styles based on edge type.
 */
function LineageEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
}: EdgeProps & { data?: LineageEdgeData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const visual = data ? getEdgeTypeVisual(data.edgeType) : null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: visual?.color ?? '#94a3b8',
          strokeWidth: 2,
          strokeDasharray: visual?.strokeDasharray,
          ...style,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-text-muted)] shadow-sm"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const LineageEdgeComponent_Memo = memo(LineageEdgeComponent);
export { LineageEdgeComponent };
