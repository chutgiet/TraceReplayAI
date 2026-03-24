'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchRun } from '@/lib/api';
import { cn, formatTimestamp, formatDuration, statusColor } from '@/lib/utils';
import { RunDetailTabs } from '@/components/run-detail-tabs';
import { RunDetailSkeleton, ErrorState } from '@/components/states';

export default function RunDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId),
  });

  if (isLoading) {
    return <RunDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Failed to load run"
          error={error}
          onRetry={() => void refetch()}
        />
        <div className="text-center">
          <Link
            href="/runs"
            className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            ← Back to all runs
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { run, summary } = data.data;
  const colors = statusColor(run.status);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-[var(--color-text-muted)]" aria-label="Breadcrumb">
        <Link href="/runs" className="hover:text-[var(--color-text-secondary)]">
          Runs
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-text-primary)]">
          {run.id.slice(0, 8)}…
        </span>
      </nav>

      {/* Run header */}
      <div className="rounded-lg border border-[var(--color-border)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-mono text-lg font-semibold">{run.id}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Agent: <span className="font-medium">{run.agentId}</span>
              {run.runName && (
                <>
                  {' — '}
                  <span className="font-medium">{run.runName}</span>
                </>
              )}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-sm font-medium',
              colors.bg,
              colors.text,
            )}
          >
            {run.status}
          </span>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--color-border)] pt-4 sm:grid-cols-4">
          <Stat label="Events" value={String(summary.eventCount)} />
          <Stat label="Duration" value={formatDuration(summary.durationMs)} />
          <Stat label="Started" value={formatTimestamp(run.startedAt)} />
          <Stat label="Ended" value={formatTimestamp(run.endedAt)} />
        </div>
      </div>

      {/* Tab navigation */}
      <RunDetailTabs runId={runId} />

      {/* Tab content */}
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}


