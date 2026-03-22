'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchRuns, type Run, type RunListParams } from '@/lib/api';
import { cn, formatTimestamp, formatDuration, statusColor } from '@/lib/utils';
import { RunFilters } from '@/components/run-filters';
import { useState } from 'react';

export default function RunsPage() {
  const [filters, setFilters] = useState<RunListParams>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['runs', filters],
    queryFn: () => fetchRuns(filters),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Browse agent execution runs
        </p>
      </div>

      <RunFilters filters={filters} onChange={setFilters} />

      {isLoading && <RunsTableSkeleton />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-950">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Failed to load runs
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-lg border border-[var(--color-border)] p-12 text-center">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No runs found
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Adjust your filters or ingest some events to get started.
          </p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <RunsTable runs={data.data} nextCursor={data.meta.nextCursor} onLoadMore={(cursor) => setFilters((prev) => ({ ...prev, cursor }))} />
      )}
    </div>
  );
}

function RunsTable({
  runs,
  nextCursor,
  onLoadMore,
}: {
  runs: Run[];
  nextCursor?: string | null;
  onLoadMore: (cursor: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <tr>
            <th className="px-4 py-3 font-medium">Run ID</th>
            <th className="px-4 py-3 font-medium">Agent</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {runs.map((run) => {
            const colors = statusColor(run.status);
            const durationMs =
              run.endedAt && run.startedAt
                ? new Date(run.endedAt).getTime() -
                  new Date(run.startedAt).getTime()
                : null;

            return (
              <tr
                key={run.id}
                className="transition-colors hover:bg-[var(--color-surface-raised)]"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/runs/${run.id}`}
                    className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {run.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                  {run.agentId}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      colors.bg,
                      colors.text,
                    )}
                  >
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                  {formatTimestamp(run.startedAt)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                  {formatDuration(durationMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nextCursor && (
        <div className="border-t border-[var(--color-border)] p-3 text-center">
          <button
            onClick={() => onLoadMore(nextCursor)}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            Load more runs
          </button>
        </div>
      )}
    </div>
  );
}

function RunsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
        <div className="h-4 w-48 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 border-b border-[var(--color-border)] px-4 py-3 last:border-0"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--color-surface-overlay)]" />
        </div>
      ))}
    </div>
  );
}
