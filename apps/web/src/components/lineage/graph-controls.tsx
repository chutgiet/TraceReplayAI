'use client';

import { useReactFlow } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface GraphControlsProps {
  className?: string;
}

/**
 * Zoom, pan, and fit-to-view controls for the lineage graph.
 */
export function GraphControls({
  className,
}: GraphControlsProps): React.JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-sm',
        className,
      )}
      role="toolbar"
      aria-label="Graph controls"
    >
      <ControlButton
        label="Zoom in"
        onClick={() => zoomIn({ duration: 200 })}
      >
        +
      </ControlButton>
      <ControlButton
        label="Zoom out"
        onClick={() => zoomOut({ duration: 200 })}
      >
        −
      </ControlButton>
      <div className="mx-1 border-t border-[var(--color-border)]" />
      <ControlButton
        label="Fit to view"
        onClick={() => fitView({ duration: 300, padding: 0.15 })}
      >
        ⊞
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
