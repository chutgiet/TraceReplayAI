'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunEvents } from '@/lib/api';
import { LineageGraphView } from '@/components/lineage';
import { LineageSkeleton, ErrorState } from '@/components/states';

export default function LineagePage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => fetchRunEvents(runId),
  });

  if (isLoading) {
    return <LineageSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load lineage data"
        error={error}
        onRetry={() => void refetch()}
      />
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
