'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchRuns, type Run, type RunListParams } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { RunFilters } from '@/components/run-filters';
import { useState } from 'react';
import {
  DataTable,
  StatusBadge,
  TimeDisplay,
  type ColumnDef,
  type RunStatus,
} from '@tracereplay/ui';
import { RunListSkeleton, RunsEmptyState, ErrorState } from '@/components/states';

const PAGE_SIZE = 20;

const columns: ColumnDef<Run>[] = [
  {
    key: 'id',
    header: 'Run ID',
    render: (run) => (
      <Link
        href={`/runs/${run.id}`}
        className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
      >
        {run.id.slice(0, 8)}…
      </Link>
    ),
  },
  {
    key: 'agentId',
    header: 'Agent',
    sortable: true,
    render: (run) => (
      <span className="text-sm text-[var(--color-text-secondary)]">
        {run.agentId}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (run) => <StatusBadge status={run.status as RunStatus} />,
  },
  {
    key: 'startedAt',
    header: 'Started',
    sortable: true,
    render: (run) => (
      <TimeDisplay
        timestamp={run.startedAt}
        format="short"
        className="text-xs text-[var(--color-text-secondary)]"
      />
    ),
  },
  {
    key: 'duration',
    header: 'Duration',
    render: (run) => {
      const durationMs =
        run.endedAt && run.startedAt
          ? new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime()
          : null;
      return (
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          {formatDuration(durationMs)}
        </span>
      );
    },
  },
  {
    key: 'eventCount',
    header: 'Events',
    sortable: true,
    render: (run) => (
      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
        {run.eventCount != null ? run.eventCount : '—'}
      </span>
    ),
  },
];

export default function RunsPage() {
  const [filters, setFilters] = useState<RunListParams>({});

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['runs', filters],
    queryFn: ({ pageParam }) =>
      fetchRuns({ ...filters, cursor: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const allRuns = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Runs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Browse and filter agent execution runs
        </p>
      </div>

      <RunFilters filters={filters} onChange={setFilters} />

      {isLoading && <RunListSkeleton />}

      {error && (
        <ErrorState
          title="Failed to load runs"
          error={error}
          onRetry={() => void fetchRuns(filters)}
        />
      )}

      {!isLoading && !error && allRuns.length === 0 && (
        <RunsEmptyState
          hasFilters={
            Boolean(filters.status || filters.agentId || filters.startedAfter || filters.startedBefore)
          }
        />
      )}

      {allRuns.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)]">
          <DataTable
            columns={columns}
            data={allRuns}
            rowKey={(run) => run.id}
            caption="Agent execution runs"
            pagination={{
              pageIndex: 0,
              pageSize: allRuns.length,
              totalItems: allRuns.length,
            }}
          />
          {hasNextPage && (
            <div className="border-t border-[var(--color-border)] p-3 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more runs'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


