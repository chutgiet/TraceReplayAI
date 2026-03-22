'use client';

import { useParams } from 'next/navigation';

export default function LineagePage() {
  const params = useParams<{ runId: string }>();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lineage Graph</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Causal dependency graph for run{' '}
          <span className="font-mono">{params.runId.slice(0, 8)}…</span>
        </p>
      </div>

      {/* Graph visualization — ready for F3-006 implementation */}
      <div className="flex h-96 items-center justify-center rounded-lg border border-[var(--color-border)]">
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Lineage graph visualization will be implemented in F3-006.
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Uses @tracereplay/graph-model + a graph rendering library.
          </p>
        </div>
      </div>
    </div>
  );
}
