'use client';

import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchEvents, type SearchParams, type SearchEvent } from '@/lib/api';
import { cn, formatTimestamp } from '@/lib/utils';
import { getEventTypeConfig } from '@/components/timeline/event-type-config';
import { SearchFilters } from '@/components/search-filters';
import {
  SearchResultsSkeleton,
  SearchPromptState,
  SearchNoResultsState,
  ErrorState,
} from '@/components/states';

const PAGE_SIZE = 20;

export default function SearchPage() {
  const [searchParams, setSearchParams] = useState<SearchParams>({ q: '' });

  const isQueryActive = searchParams.q.trim().length > 0;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['search', searchParams],
    queryFn: ({ pageParam }) =>
      searchEvents({ ...searchParams, cursor: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    enabled: isQueryActive,
  });

  const allResults = data?.pages.flatMap((page) => page.data) ?? [];
  const totalEstimate = data?.pages[0]?.meta.totalEstimate;

  const handleSearch = useCallback((params: SearchParams) => {
    setSearchParams(params);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Full-text search across event payloads
        </p>
      </div>

      <SearchFilters params={searchParams} onSearch={handleSearch} />

      {/* Results summary */}
      {isQueryActive && !isLoading && !error && allResults.length > 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {totalEstimate !== undefined && totalEstimate > allResults.length
            ? `Showing ${allResults.length} of ~${totalEstimate} results`
            : `${allResults.length} result${allResults.length === 1 ? '' : 's'}`}
          {' for '}
          <span className="font-medium text-[var(--color-text-primary)]">
            &ldquo;{searchParams.q}&rdquo;
          </span>
        </p>
      )}

      {/* Loading state */}
      {isLoading && <SearchResultsSkeleton />}

      {/* Error state */}
      {error && (
        <ErrorState
          title="Search failed"
          error={error}
          onRetry={() => void searchEvents(searchParams)}
        />
      )}

      {/* Empty state — no query yet */}
      {!isQueryActive && <SearchPromptState />}

      {/* Empty state — no results */}
      {isQueryActive && !isLoading && !error && allResults.length === 0 && (
        <SearchNoResultsState query={searchParams.q} />
      )}

      {/* Results list */}
      {allResults.length > 0 && (
        <div className="space-y-3">
          {allResults.map((event) => (
            <SearchResultCard key={event.id} event={event} />
          ))}

          {hasNextPage && (
            <div className="pt-2 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-50 dark:text-brand-400"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more results'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ event }: { event: SearchEvent }) {
  const config = getEventTypeConfig(event.type);

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] border-l-4 p-4 transition-colors hover:bg-[var(--color-surface-overlay)]',
        config.borderColor,
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">{config.icon}</span>
        <span className="text-sm font-medium">{config.label}</span>
        <span className="rounded bg-[var(--color-surface-overlay)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-text-muted)]">
          {event.type}
        </span>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">
          {formatTimestamp(event.timestamp)}
        </span>
      </div>

      {/* Headline snippet with highlighted matches */}
      <div
        className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)] [&_mark]:rounded-sm [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:font-medium [&_mark]:text-yellow-900 dark:[&_mark]:bg-yellow-800 dark:[&_mark]:text-yellow-100"
        dangerouslySetInnerHTML={{ __html: sanitizeHeadline(event.headline) }}
      />

      {/* Footer: run link, agent, relevance */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <Link
          href={`/runs/${event.runId}`}
          className="font-mono text-brand-600 hover:underline dark:text-brand-400"
        >
          Run {event.runId.slice(0, 8)}...
        </Link>
        <span>Agent: {event.sourceAgent}</span>
        {event.sourceFramework && <span>Framework: {event.sourceFramework}</span>}
        <span className="ml-auto font-mono">
          Relevance: {Number(event.rank).toFixed(4)}
        </span>
      </div>
    </div>
  );
}

/**
 * Sanitize the headline HTML to only allow <mark> tags.
 * This prevents XSS from untrusted event payload content.
 */
function sanitizeHeadline(html: string): string {
  return html
    .replace(/<(?!\/?(mark)\b)[^>]*>/gi, '')
    .replace(/&(?!(amp|lt|gt|quot|#39);)/g, '&amp;');
}


