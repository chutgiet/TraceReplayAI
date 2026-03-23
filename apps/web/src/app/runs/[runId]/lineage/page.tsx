'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunEvents } from '@/lib/api';
import { LineageGraphView } from '@/components/lineage';

export default function LineagePage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => fetchRunEvents(runId),
  });

  if (isLoading) {
    return <LineageSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          Failed to load lineage data
        </p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lineage Graph</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Causal dependency graph for run{' '}
          <span className="font-mono">{runId.slice(0, 8)}…</span>
        </p>
      </div>

      <LineageGraphView events={data.data} />
    </div>
  );
}

function LineageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
      <div className="h-10 w-full animate-pulse rounded bg-[var(--color-surface-overlay)]" />
      <div className="h-[600px] animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-overlay)]" />
    </div>
  );
}
