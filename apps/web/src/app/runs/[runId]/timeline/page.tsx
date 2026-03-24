'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunTimeline } from '@/lib/api';
import { ReplayTimelineView } from '@/components/timeline';
import { TimelineSkeleton, ErrorState } from '@/components/states';

export default function TimelinePage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['timeline', runId],
    queryFn: () => fetchRunTimeline(runId),
  });

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load timeline"
        error={error}
        onRetry={() => void refetch()}
      />
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
