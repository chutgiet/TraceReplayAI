'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunEvents, fetchChildRuns } from '@/lib/api';
import type { RunEvent } from '@/lib/api';
import { LineageGraphView } from '@/components/lineage';
import { LineageSkeleton, ErrorState } from '@/components/states';

export default function LineagePage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  // Fetch the main run events
  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => fetchRunEvents(runId),
  });

  // Fetch child runs to determine if we need cross-run lineage
  const childRunsQuery = useQuery({
    queryKey: ['child-runs', runId],
    queryFn: () => fetchChildRuns(runId),
  });

  // Fetch events for each child run (only when child runs are loaded)
  const childRunIds = childRunsQuery.data?.data?.map((r) => r.id).filter(Boolean) as string[] ?? [];
  const childEventsQuery = useQuery({
    queryKey: ['child-run-events', ...childRunIds],
    queryFn: async () => {
      const allChildEvents: RunEvent[] = [];
      for (const childId of childRunIds) {
        const res = await fetchRunEvents(childId);
        allChildEvents.push(...res.data);
      }
      return allChildEvents;
    },
    enabled: childRunIds.length > 0,
  });

  const isLoading = eventsQuery.isLoading || childRunsQuery.isLoading;
  const error = eventsQuery.error || childRunsQuery.error;

  if (isLoading) {
    return <LineageSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load lineage data"
        error={error}
        onRetry={() => {
          void eventsQuery.refetch();
          void childRunsQuery.refetch();
        }}
      />
    );
  }

  if (!eventsQuery.data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lineage Graph</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Causal dependency graph for run{' '}
          <span className="font-mono">{runId.slice(0, 8)}…</span>
          {childRunIds.length > 0 && (
            <span className="ml-2 text-violet-600 dark:text-violet-400">
              ({childRunIds.length} sub-agent {childRunIds.length === 1 ? 'run' : 'runs'} linked)
            </span>
          )}
        </p>
      </div>

      <LineageGraphView
        events={eventsQuery.data.data}
        relatedRunEvents={childEventsQuery.data ?? []}
      />
    </div>
  );
}
