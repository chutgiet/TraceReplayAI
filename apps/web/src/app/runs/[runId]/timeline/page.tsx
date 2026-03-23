'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunTimeline } from '@/lib/api';
import { ReplayTimelineView } from '@/components/timeline';

export default function TimelinePage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline', runId],
    queryFn: () => fetchRunTimeline(runId),
  });

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
        <p className="text-sm font-medium text-red-800 dark:text-red-200">
          Failed to load timeline
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
        <h2 className="text-lg font-semibold">Replay Timeline</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Chronological replay of events for this run
        </p>
      </div>

      <ReplayTimelineView timeline={data.data} />
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-3 rounded border border-[var(--color-border)] p-4"
          >
            <div className="h-4 w-4 animate-pulse rounded-full bg-[var(--color-surface-overlay)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
              <div className="h-3 w-full animate-pulse rounded bg-[var(--color-surface-overlay)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
