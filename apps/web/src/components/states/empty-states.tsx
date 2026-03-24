'use client';

import { EmptyState } from '@tracereplay/ui';

// ---------------------------------------------------------------------------
// Domain-specific empty states with contextual icons and descriptions.
// Uses Unicode symbols for zero-dependency lightweight icons.
// ---------------------------------------------------------------------------

/** Empty state shown when no runs match current filters. */
export function RunsEmptyState({ hasFilters }: { hasFilters?: boolean }) {
  return (
    <EmptyState
      title={hasFilters ? 'No runs match your filters' : 'No runs yet'}
      description={
        hasFilters
          ? 'Try adjusting your filters or clearing them to see all runs.'
          : 'Runs will appear here once your AI agents start sending telemetry via the SDK.'
      }
      icon={<span className="text-3xl">📋</span>}
      action={
        hasFilters ? undefined : (
          <a
            href="https://docs.tracereplay.ai/sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Read the SDK docs →
          </a>
        )
      }
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}

/** Empty state shown when a run has no recorded events. */
export function EventsEmptyState() {
  return (
    <EmptyState
      title="No events recorded"
      description="This run has no events. It may still be in progress, or the agent completed without emitting telemetry."
      icon={<span className="text-3xl">📭</span>}
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}

/** Empty state shown when the timeline has no entries. */
export function TimelineEmptyState() {
  return (
    <EmptyState
      title="No events in timeline"
      description="This run has no recorded events to display. Events will appear here once the agent emits telemetry."
      icon={<span className="text-3xl">⏱️</span>}
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}

/** Empty state shown when lineage data has no causal relationships. */
export function LineageEmptyState() {
  return (
    <EmptyState
      title="No lineage data available"
      description="Events may not have enough causal relationships to build a graph. Try a run with tool calls or sub-agent delegation."
      icon={<span className="text-3xl">🔗</span>}
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}

/** Empty state shown before a search query is entered. */
export function SearchPromptState() {
  return (
    <EmptyState
      title="Start searching"
      description="Enter a query to search across event payloads, tool calls, prompts, error messages, and more."
      icon={<span className="text-3xl">🔍</span>}
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}

/** Empty state shown when search returns no results. */
export function SearchNoResultsState({ query }: { query: string }) {
  return (
    <EmptyState
      title="No results found"
      description={`No events matched "${query}". Try different keywords, check spelling, or broaden your filters.`}
      icon={<span className="text-3xl">🔎</span>}
      className="rounded-lg border border-[var(--color-border)] p-12"
    />
  );
}
