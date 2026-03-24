import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReplayTimelineView } from '../replay-timeline-view';
import type { ReplayTimeline, TimelineEntry, TimelineGap, RunSummary } from '@/lib/api';

// Mock @tracereplay/ui
vi.mock('@tracereplay/ui', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
  TimeDisplay: ({ timestamp, format }: { timestamp: string; format?: string }) => (
    <time data-testid="time-display" data-format={format}>{timestamp}</time>
  ),
  JsonViewer: ({ data }: { data: unknown }) => (
    <pre data-testid="json-viewer">{JSON.stringify(data)}</pre>
  ),
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-001',
    runId: 'run-001',
    tenantId: 'tenant-001',
    type: 'run.start',
    timestamp: '2026-03-15T10:00:00.000Z',
    sequence: 1,
    parentEventId: null,
    sourceAgent: 'test-agent',
    sourceFramework: 'custom',
    payload: { runName: 'test-run' },
    rawMeta: null,
    tags: {},
    schemaVersion: '1.0.0',
    receivedAt: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    event: makeEvent(),
    index: 0,
    depth: 0,
    childEventIds: [],
    ...overrides,
  } as TimelineEntry;
}

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-001',
    tenantId: 'tenant-001',
    eventCount: 5,
    eventTypeCounts: { 'run.start': 1, 'prompt.input': 2, 'run.end': 1 },
    startTime: '2026-03-15T10:00:00.000Z',
    endTime: '2026-03-15T10:05:00.000Z',
    durationMs: 300000,
    status: 'success',
    hasGaps: false,
    toolCount: 2,
    hasErrors: false,
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<ReplayTimeline> = {}): ReplayTimeline {
  return {
    entries: [
      makeEntry({
        event: makeEvent({ id: 'evt-001', type: 'run.start', sequence: 1, payload: { runName: 'test-run' } }),
        index: 0,
      }),
      makeEntry({
        event: makeEvent({
          id: 'evt-002',
          type: 'prompt.input',
          sequence: 2,
          timestamp: '2026-03-15T10:00:01.000Z',
          payload: { role: 'user', content: 'Hello world' },
        }),
        index: 1,
      }),
      makeEntry({
        event: makeEvent({
          id: 'evt-003',
          type: 'tool.call.start',
          sequence: 3,
          timestamp: '2026-03-15T10:00:02.000Z',
          payload: { toolName: 'search' },
        }),
        index: 2,
        durationMs: 1500,
      }),
      makeEntry({
        event: makeEvent({
          id: 'evt-004',
          type: 'tool.call.end',
          sequence: 4,
          timestamp: '2026-03-15T10:00:03.500Z',
          payload: { toolName: 'search', success: true },
        }),
        index: 3,
      }),
      makeEntry({
        event: makeEvent({
          id: 'evt-005',
          type: 'run.end',
          sequence: 5,
          timestamp: '2026-03-15T10:05:00.000Z',
          payload: { status: 'success' },
        }),
        index: 4,
      }),
    ],
    gaps: [],
    summary: makeSummary(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReplayTimelineView', () => {
  it('renders empty state when no entries', () => {
    const timeline = makeTimeline({
      entries: [],
      summary: makeSummary({ eventCount: 0 }),
    });

    render(<ReplayTimelineView timeline={timeline} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No events in timeline')).toBeInTheDocument();
  });

  it('renders summary header with correct stats', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    // Event count
    expect(screen.getByText('5')).toBeInTheDocument();
    // Status badge
    expect(screen.getByText('success')).toBeInTheDocument();
    // Tool count
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders all timeline entries', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    const list = screen.getByRole('list', { name: 'Replay timeline' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
  });

  it('renders event type labels', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    expect(screen.getByText('Run Start')).toBeInTheDocument();
    expect(screen.getByText('Prompt Input')).toBeInTheDocument();
    expect(screen.getByText('Tool Call')).toBeInTheDocument();
    expect(screen.getByText('Tool Result')).toBeInTheDocument();
    expect(screen.getByText('Run End')).toBeInTheDocument();
  });

  it('renders event summaries', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    expect(screen.getByText('Run: test-run')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('search(…)')).toBeInTheDocument();
    expect(screen.getByText('search → success')).toBeInTheDocument();
    expect(screen.getByText('Status: success')).toBeInTheDocument();
  });

  it('renders duration bar for entries with durationMs', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    // Tool call start has a 1500ms duration bar
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('expands event detail panel on click', async () => {
    const user = userEvent.setup();
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    // Click the first entry (Run Start)
    const firstEntry = screen.getByRole('button', { name: /Run Start/i });
    await user.click(firstEntry);

    // Detail panel should show JsonViewer with payload
    expect(screen.getAllByTestId('json-viewer').length).toBeGreaterThanOrEqual(1);
    // Should show the Payload heading
    expect(screen.getAllByText('Payload').length).toBeGreaterThanOrEqual(1);
  });

  it('closes event detail panel on close button click', async () => {
    const user = userEvent.setup();
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    // Open detail panel
    const firstEntry = screen.getByRole('button', { name: /Run Start/i });
    await user.click(firstEntry);
    expect(screen.getAllByText('Payload').length).toBeGreaterThanOrEqual(1);

    // Close it
    const closeBtn = screen.getByRole('button', { name: /Close event detail/i });
    await user.click(closeBtn);

    // Payload should be gone
    expect(screen.queryByText('Payload')).not.toBeInTheDocument();
  });

  it('toggles selection when clicking the same entry twice', async () => {
    const user = userEvent.setup();
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    const firstEntry = screen.getByRole('button', { name: /Run Start/i });

    // Click to open
    await user.click(firstEntry);
    expect(screen.getAllByText('Payload').length).toBeGreaterThanOrEqual(1);

    // Click same entry to close
    await user.click(firstEntry);
    expect(screen.queryByText('Payload')).not.toBeInTheDocument();
  });

  it('renders gap markers when gaps exist', () => {
    const gap: TimelineGap = {
      type: 'unclosed_tool_call',
      message: 'Tool call "search" was started but never completed.',
      relatedEventIds: ['evt-003'],
      detectedAtIndex: 2,
    };

    const timeline = makeTimeline({
      gaps: [gap],
      summary: makeSummary({ hasGaps: true }),
    });

    render(<ReplayTimelineView timeline={timeline} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Unclosed Tool Call')).toBeInTheDocument();
    expect(
      screen.getByText('Tool call "search" was started but never completed.'),
    ).toBeInTheDocument();
  });

  it('renders missing_run_start gap before the timeline', () => {
    const gap: TimelineGap = {
      type: 'missing_run_start',
      message: 'No run.start event found in the timeline.',
      relatedEventIds: [],
      detectedAtIndex: 0,
    };

    const timeline = makeTimeline({
      gaps: [gap],
      summary: makeSummary({ hasGaps: true }),
    });

    render(<ReplayTimelineView timeline={timeline} />);

    expect(screen.getByText('Missing Run Start')).toBeInTheDocument();
  });

  it('renders errors badge when hasErrors is true', () => {
    const timeline = makeTimeline({
      summary: makeSummary({ hasErrors: true }),
    });

    render(<ReplayTimelineView timeline={timeline} />);
    expect(screen.getByText('Errors detected')).toBeInTheDocument();
  });

  it('renders gap count badge', () => {
    const timeline = makeTimeline({
      gaps: [
        { type: 'unclosed_tool_call', message: 'Tool never completed', relatedEventIds: ['evt-003'], detectedAtIndex: 2 },
      ],
      summary: makeSummary({ hasGaps: true }),
    });

    render(<ReplayTimelineView timeline={timeline} />);
    expect(screen.getByText('1 gap')).toBeInTheDocument();
  });

  it('renders plural gaps badge', () => {
    const timeline = makeTimeline({
      gaps: [
        { type: 'unclosed_tool_call', message: 'Gap 1', relatedEventIds: [], detectedAtIndex: 2 },
        { type: 'missing_run_end', message: 'Gap 2', relatedEventIds: [], detectedAtIndex: 4 },
      ],
      summary: makeSummary({ hasGaps: true }),
    });

    render(<ReplayTimelineView timeline={timeline} />);
    expect(screen.getByText('2 gaps')).toBeInTheDocument();
  });

  it('renders causal depth indentation', () => {
    const timeline = makeTimeline({
      entries: [
        makeEntry({
          event: makeEvent({ id: 'evt-001', type: 'run.start' }),
          index: 0,
          depth: 0,
        }),
        makeEntry({
          event: makeEvent({ id: 'evt-002', type: 'tool.call.start', payload: { toolName: 'fetch' } }),
          index: 1,
          depth: 1,
        }),
        makeEntry({
          event: makeEvent({ id: 'evt-003', type: 'tool.call.start', payload: { toolName: 'parse' } }),
          index: 2,
          depth: 2,
        }),
      ],
      summary: makeSummary({ eventCount: 3 }),
    });

    render(<ReplayTimelineView timeline={timeline} />);

    // All entries should render — depth affects padding but they should all be present
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('shows sequence numbers', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('renders source agent names', () => {
    render(<ReplayTimelineView timeline={makeTimeline()} />);

    const agents = screen.getAllByText('test-agent');
    expect(agents.length).toBeGreaterThanOrEqual(1);
  });

  it('renders delegation points section when present', () => {
    const timeline = makeTimeline({
      delegationPoints: [
        {
          childRunId: 'child-run-001',
          childAgentId: 'research-sub-agent',
          childRunName: 'ai-safety-research',
          childStatus: 'success',
          childStartedAt: '2026-03-15T10:01:00.000Z',
          childEndedAt: '2026-03-15T10:02:00.000Z',
        },
      ],
    });

    render(<ReplayTimelineView timeline={timeline} />);

    const matches = screen.getAllByText(/sub-agent delegation/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // childRunName is rendered (falls back to childAgentId when absent)
    expect(screen.getByText(/ai-safety-research/)).toBeInTheDocument();
  });

  it('does not render delegation section when no delegation points', () => {
    const timeline = makeTimeline({ delegationPoints: [] });

    render(<ReplayTimelineView timeline={timeline} />);

    expect(screen.queryByText(/sub-agent delegation/i)).not.toBeInTheDocument();
  });
});
