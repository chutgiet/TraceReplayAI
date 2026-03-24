import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RunsPage from '@/app/runs/page';
import type { Run, ApiResponse } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchRuns = vi.fn<(...args: unknown[]) => Promise<ApiResponse<Run[]>>>();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    fetchRuns: (...args: unknown[]) => mockFetchRuns(...args),
  };
});

// Mock next/link to render as plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'tenant-abc',
    agentId: 'agent-1',
    runName: 'test-run',
    triggerSource: 'api',
    parentRunId: null,
    status: 'success',
    startedAt: '2026-03-15T10:00:00.000Z',
    endedAt: '2026-03-15T10:05:00.000Z',
    tags: {},
    metadata: {},
    schemaVersion: '1.0.0',
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:05:00.000Z',
    eventCount: 12,
    ...overrides,
  };
}

function makeApiResponse(
  runs: Run[],
  nextCursor: string | null = null,
): ApiResponse<Run[]> {
  return {
    data: runs,
    meta: {
      requestId: 'req-123',
      nextCursor,
      count: runs.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RunsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page heading', async () => {
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([]));
    renderWithProviders(<RunsPage />);

    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument();
    expect(
      screen.getByText('Browse and filter agent execution runs'),
    ).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    // Never resolve the promise so we stay in loading state
    mockFetchRuns.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RunsPage />);

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows empty state when no runs match', async () => {
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/will appear here once/i),
    ).toBeInTheDocument();
  });

  it('displays runs in a table with all columns', async () => {
    const run = makeRun();
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('550e8400…')).toBeInTheDocument();
    });

    // Agent column
    expect(screen.getByText('agent-1')).toBeInTheDocument();

    // Status badge (may appear in multiple places)
    const successBadges = screen.getAllByText('Success');
    expect(successBadges.length).toBeGreaterThanOrEqual(1);

    // Event count
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders run ID as a link to run detail page', async () => {
    const run = makeRun();
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      const link = screen.getByText('550e8400…');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute(
        'href',
        '/runs/550e8400-e29b-41d4-a716-446655440000',
      );
    });
  });

  it('shows dash for event count when not available', async () => {
    const run = makeRun({ eventCount: undefined });
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('550e8400…')).toBeInTheDocument();
    });
    // The '—' should appear for the event count column
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows duration for completed runs', async () => {
    const run = makeRun({
      startedAt: '2026-03-15T10:00:00.000Z',
      endedAt: '2026-03-15T10:05:00.000Z',
    });
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('5m 0s')).toBeInTheDocument();
    });
  });

  it('shows dash for duration of running runs', async () => {
    const run = makeRun({ status: 'running', endedAt: null });
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('550e8400…')).toBeInTheDocument();
    });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows error state when fetch fails', async () => {
    mockFetchRuns.mockRejectedValueOnce(new Error('Network error'));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load runs')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows "Load more runs" button when there is a next page', async () => {
    const run = makeRun();
    mockFetchRuns.mockResolvedValueOnce(
      makeApiResponse([run], '2026-03-15T09:00:00.000Z'),
    );
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('Load more runs')).toBeInTheDocument();
    });
  });

  it('does not show "Load more" when there is no next page', async () => {
    const run = makeRun();
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([run], null));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('550e8400…')).toBeInTheDocument();
    });
    expect(screen.queryByText('Load more runs')).not.toBeInTheDocument();
  });

  it('fetches next page when "Load more" is clicked', async () => {
    const user = userEvent.setup();
    const run1 = makeRun({ id: '550e8400-e29b-41d4-a716-446655440000' });
    const run2 = makeRun({
      id: '660e8400-e29b-41d4-a716-446655440001',
      agentId: 'agent-2',
    });

    mockFetchRuns
      .mockResolvedValueOnce(
        makeApiResponse([run1], '2026-03-15T09:00:00.000Z'),
      )
      .mockResolvedValueOnce(makeApiResponse([run2], null));

    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('Load more runs')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Load more runs'));

    await waitFor(() => {
      // Both runs should be visible (accumulated pages)
      expect(screen.getByText('550e8400…')).toBeInTheDocument();
      expect(screen.getByText('660e8400…')).toBeInTheDocument();
    });
  });

  it('renders multiple runs with different statuses', async () => {
    const runs = [
      makeRun({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'success' }),
      makeRun({ id: '660e8400-e29b-41d4-a716-446655440001', status: 'failure' }),
      makeRun({ id: '770e8400-e29b-41d4-a716-446655440002', status: 'running' }),
    ];
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse(runs));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Failure')).toBeInTheDocument();
      expect(screen.getByText('Running')).toBeInTheDocument();
    });
  });

  it('renders filter controls', async () => {
    mockFetchRuns.mockResolvedValueOnce(makeApiResponse([]));
    renderWithProviders(<RunsPage />);

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Agent ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Started after')).toBeInTheDocument();
    expect(screen.getByLabelText('Started before')).toBeInTheDocument();
  });

  it('refetches when status filter changes', async () => {
    mockFetchRuns.mockResolvedValue(makeApiResponse([]));
    renderWithProviders(<RunsPage />);

    await waitFor(() => {
      expect(mockFetchRuns).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'failure' },
    });

    await waitFor(() => {
      expect(mockFetchRuns).toHaveBeenCalledTimes(2);
    });
  });
});

// Need to import fireEvent for the sync filter change
import { fireEvent } from '@testing-library/react';
