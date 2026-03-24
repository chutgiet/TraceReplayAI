import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RunListSkeleton,
  RunDetailSkeleton,
  RunEventsSkeleton,
  TimelineSkeleton,
  LineageSkeleton,
  SearchResultsSkeleton,
  EventDetailSkeleton,
} from '../loading-skeletons';
import {
  RunsEmptyState,
  EventsEmptyState,
  TimelineEmptyState,
  LineageEmptyState,
  SearchPromptState,
  SearchNoResultsState,
} from '../empty-states';
import { ErrorState, FullPageError } from '../error-state';

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

describe('Loading skeletons', () => {
  it('RunListSkeleton renders with default row count', () => {
    const { container } = render(<RunListSkeleton />);
    // Default 8 rows + 1 header = 9 child divs
    const rows = container.querySelectorAll('[role="status"]');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('RunListSkeleton accepts custom row count', () => {
    const { container } = render(<RunListSkeleton rows={3} />);
    // Should render table structure
    expect(container.firstChild).toBeInTheDocument();
  });

  it('RunDetailSkeleton renders with aria label', () => {
    render(<RunDetailSkeleton />);
    expect(screen.getByRole('status', { name: /loading run details/i })).toBeInTheDocument();
  });

  it('RunEventsSkeleton renders with aria label', () => {
    render(<RunEventsSkeleton />);
    expect(screen.getByRole('status', { name: /loading events/i })).toBeInTheDocument();
  });

  it('TimelineSkeleton renders with aria label', () => {
    render(<TimelineSkeleton />);
    expect(screen.getByRole('status', { name: /loading timeline/i })).toBeInTheDocument();
  });

  it('LineageSkeleton renders with aria label', () => {
    render(<LineageSkeleton />);
    expect(screen.getByRole('status', { name: /loading lineage/i })).toBeInTheDocument();
  });

  it('SearchResultsSkeleton renders with aria label', () => {
    render(<SearchResultsSkeleton />);
    expect(screen.getByRole('status', { name: /loading search results/i })).toBeInTheDocument();
  });

  it('EventDetailSkeleton renders with aria label', () => {
    render(<EventDetailSkeleton />);
    expect(screen.getByRole('status', { name: /loading event details/i })).toBeInTheDocument();
  });

  it('TimelineSkeleton with custom row count renders without errors', () => {
    const { container } = render(<TimelineSkeleton rows={10} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('SearchResultsSkeleton with custom row count renders without errors', () => {
    const { container } = render(<SearchResultsSkeleton rows={3} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

describe('Empty states', () => {
  it('RunsEmptyState shows no-filter message when no filters applied', () => {
    render(<RunsEmptyState />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.getByText(/will appear here once/i)).toBeInTheDocument();
    expect(screen.getByText(/SDK docs/i)).toBeInTheDocument();
  });

  it('RunsEmptyState shows filter-specific message when filters active', () => {
    render(<RunsEmptyState hasFilters />);
    expect(screen.getByText('No runs match your filters')).toBeInTheDocument();
    expect(screen.getByText(/adjusting your filters/i)).toBeInTheDocument();
  });

  it('EventsEmptyState renders correctly', () => {
    render(<EventsEmptyState />);
    expect(screen.getByText('No events recorded')).toBeInTheDocument();
    expect(screen.getByText(/may still be in progress/i)).toBeInTheDocument();
  });

  it('TimelineEmptyState renders correctly', () => {
    render(<TimelineEmptyState />);
    expect(screen.getByText('No events in timeline')).toBeInTheDocument();
  });

  it('LineageEmptyState renders correctly', () => {
    render(<LineageEmptyState />);
    expect(screen.getByText('No lineage data available')).toBeInTheDocument();
    expect(screen.getByText(/causal relationships/i)).toBeInTheDocument();
  });

  it('SearchPromptState renders correctly', () => {
    render(<SearchPromptState />);
    expect(screen.getByText('Start searching')).toBeInTheDocument();
    expect(screen.getByText(/enter a query/i)).toBeInTheDocument();
  });

  it('SearchNoResultsState includes the search query in message', () => {
    render(<SearchNoResultsState query="test-query" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText(/test-query/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe('ErrorState', () => {
  it('renders with default title', () => {
    render(<ErrorState error="Something broke" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders with custom title', () => {
    render(<ErrorState title="Failed to load data" error="Timeout" />);
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
  });

  it('extracts message from Error object', () => {
    render(<ErrorState error={new Error('Network failure')} />);
    expect(screen.getByText('Network failure')).toBeInTheDocument();
  });

  it('shows fallback message for non-Error, non-string values', () => {
    render(<ErrorState error={{ code: 500 }} />);
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    const onRetry = vi.fn();
    render(<ErrorState error="Error" onRetry={onRetry} />);

    const button = screen.getByRole('button', { name: /try again/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry not provided', () => {
    render(<ErrorState error="Error" />);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('shows retrying state', () => {
    const onRetry = vi.fn();
    render(<ErrorState error="Error" onRetry={onRetry} isRetrying />);

    const button = screen.getByRole('button', { name: /retrying/i });
    expect(button).toBeDisabled();
  });

  it('applies compact mode styling', () => {
    const { container } = render(<ErrorState error="Error" compact />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.className).toContain('p-4');
  });
});

describe('FullPageError', () => {
  it('renders error message and retry button', () => {
    const reset = vi.fn();
    render(<FullPageError error={new Error('Page crashed')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Page crashed')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders link to runs page', () => {
    render(<FullPageError error={new Error('Oops')} reset={vi.fn()} />);
    const link = screen.getByRole('link', { name: /go to runs/i });
    expect(link).toHaveAttribute('href', '/runs');
  });

  it('shows fallback message when error has no message', () => {
    const error = new Error();
    error.message = '';
    render(<FullPageError error={error} reset={vi.fn()} />);
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
  });
});
