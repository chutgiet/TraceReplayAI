'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRunEvents } from '@/lib/api';
import { eventTypeClass, formatTimestamp } from '@/lib/utils';

export default function RunOverviewPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error } = useQuery({
    queryKey: ['events', runId],
    queryFn: () => fetchRunEvents(runId),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded border border-[var(--color-border)] bg-[var(--color-surface-overlay)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
        <p className="text-sm text-red-800 dark:text-red-200">
          Failed to load events
        </p>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No events recorded for this run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
        Events ({data.data.length})
      </h2>
      <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {data.data.map((event) => (
          <div
            key={event.id}
            className={`flex items-center gap-4 px-4 py-3 ${eventTypeClass(event.type)} border-l-2`}
          >
            <span className="min-w-0 shrink-0 font-mono text-xs text-[var(--color-text-muted)]">
              #{event.sequence ?? '—'}
            </span>
            <span className="min-w-0 shrink-0 rounded bg-[var(--color-surface-overlay)] px-2 py-0.5 text-xs font-medium">
              {event.type}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-secondary)]">
              {event.sourceAgent}
            </span>
            <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
