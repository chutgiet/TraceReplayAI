import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailPanel, findRedactedFields, extractStructuredFields } from '../event-detail-panel';
import type { TimelineEntry } from '@/lib/api';

// Mock @tracereplay/ui
vi.mock('@tracereplay/ui', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>{children}</span>
  ),
  TimeDisplay: ({ timestamp, format }: { timestamp: string; format?: string }) => (
    <time data-testid="time-display" data-format={format}>{timestamp}</time>
  ),
  JsonViewer: ({ data, defaultExpandDepth }: { data: unknown; defaultExpandDepth?: number }) => (
    <pre data-testid="json-viewer" data-depth={defaultExpandDepth}>{JSON.stringify(data)}</pre>
  ),
}));

// Clipboard mock – navigator.clipboard is not always available in jsdom,
// so we stub it before each test with a configurable property.
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: (_text: string) => Promise.resolve(),
    },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-abc12345-6789-0000-0000-000000000001',
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

// ---------------------------------------------------------------------------
// findRedactedFields tests
// ---------------------------------------------------------------------------

describe('findRedactedFields', () => {
  it('returns empty array for objects with no redacted fields', () => {
    expect(findRedactedFields({ foo: 'bar', num: 42 })).toEqual([]);
  });

  it('finds top-level redacted fields', () => {
    const result = findRedactedFields({ content: '[REDACTED]', role: 'user' });
    expect(result).toEqual(['content']);
  });

  it('finds nested redacted fields', () => {
    const result = findRedactedFields({
      outer: { inner: '[REDACTED]', safe: 'ok' },
      top: 'fine',
    });
    expect(result).toEqual(['outer.inner']);
  });

  it('finds deeply nested redacted fields', () => {
    const result = findRedactedFields({
      a: { b: { c: { d: '[REDACTED]' } } },
    });
    expect(result).toEqual(['a.b.c.d']);
  });

  it('finds multiple redacted fields', () => {
    const result = findRedactedFields({
      content: '[REDACTED]',
      apiKey: '[REDACTED]',
      safe: 'value',
    });
    expect(result).toEqual(['content', 'apiKey']);
  });

  it('returns empty array for null/undefined/primitive inputs', () => {
    expect(findRedactedFields(null)).toEqual([]);
    expect(findRedactedFields(undefined)).toEqual([]);
    expect(findRedactedFields('string')).toEqual([]);
    expect(findRedactedFields(42)).toEqual([]);
  });

  it('handles arrays inside objects', () => {
    const result = findRedactedFields({
      items: [{ value: '[REDACTED]' }, { value: 'ok' }],
    });
    expect(result).toEqual(['items.0.value']);
  });
});

// ---------------------------------------------------------------------------
// extractStructuredFields tests
// ---------------------------------------------------------------------------

describe('extractStructuredFields', () => {
  it('extracts run.start fields', () => {
    const fields = extractStructuredFields('run.start', {
      runName: 'my-run',
      triggerSource: 'api',
      parentRunId: 'parent-001',
    });
    expect(fields).toEqual([
      { label: 'Run Name', value: 'my-run', variant: undefined },
      { label: 'Trigger', value: 'api', variant: 'badge-info' },
      { label: 'Parent Run', value: 'parent-001', variant: 'code' },
    ]);
  });

  it('extracts run.end fields with success status', () => {
    const fields = extractStructuredFields('run.end', {
      status: 'success',
      durationMs: 5000,
      summary: 'Completed',
    });
    expect(fields[0]).toEqual({ label: 'Status', value: 'success', variant: 'badge-success' });
    expect(fields[1]).toEqual({ label: 'Duration', value: '5.0s', variant: undefined });
    expect(fields[2]).toEqual({ label: 'Summary', value: 'Completed', variant: undefined });
  });

  it('extracts run.end fields with failure status', () => {
    const fields = extractStructuredFields('run.end', { status: 'failure' });
    expect(fields[0]).toEqual({ label: 'Status', value: 'failure', variant: 'badge-error' });
  });

  it('extracts tool.call.start fields', () => {
    const fields = extractStructuredFields('tool.call.start', {
      toolName: 'search',
      toolId: 'tool-123',
    });
    expect(fields).toEqual([
      { label: 'Tool', value: 'search', variant: 'code' },
      { label: 'Tool ID', value: 'tool-123', variant: 'code' },
    ]);
  });

  it('extracts tool.call.end fields with success', () => {
    const fields = extractStructuredFields('tool.call.end', {
      toolName: 'search',
      success: true,
      durationMs: 1500,
    });
    expect(fields[0]).toEqual({ label: 'Tool', value: 'search', variant: 'code' });
    expect(fields[1]).toEqual({ label: 'Success', value: true, variant: 'badge-success' });
    expect(fields[2]).toEqual({ label: 'Duration', value: '1.5s', variant: undefined });
  });

  it('extracts tool.call.end fields with failure', () => {
    const fields = extractStructuredFields('tool.call.end', {
      toolName: 'search',
      success: false,
    });
    expect(fields[1]).toEqual({ label: 'Success', value: false, variant: 'badge-error' });
  });

  it('extracts prompt.input fields', () => {
    const fields = extractStructuredFields('prompt.input', {
      role: 'user',
      tokenCount: 150,
      content: 'Hello',
    });
    expect(fields[0]).toEqual({ label: 'Role', value: 'user', variant: 'badge-info' });
    expect(fields[1]).toEqual({ label: 'Token Count', value: 150, variant: undefined });
  });

  it('extracts approval.requested fields', () => {
    const fields = extractStructuredFields('approval.requested', {
      approvalType: 'human',
      requestedAction: 'deploy',
      requestedBy: 'agent-1',
    });
    expect(fields).toEqual([
      { label: 'Type', value: 'human', variant: 'badge-info' },
      { label: 'Action', value: 'deploy', variant: undefined },
      { label: 'Requested By', value: 'agent-1', variant: undefined },
    ]);
  });

  it('extracts run.error fields', () => {
    const fields = extractStructuredFields('run.error', {
      errorType: 'TypeError',
      errorMessage: 'Something broke',
      fatal: true,
    });
    expect(fields[0]).toEqual({ label: 'Error Type', value: 'TypeError', variant: 'badge-error' });
    expect(fields[1]).toEqual({ label: 'Message', value: 'Something broke', variant: undefined });
    expect(fields[2]).toEqual({ label: 'Fatal', value: true, variant: 'badge-error' });
  });

  it('extracts context.retrieved fields', () => {
    const fields = extractStructuredFields('context.retrieved', {
      source: 'vector_db',
      snippetCount: 5,
      query: 'deployment guide',
    });
    expect(fields).toEqual([
      { label: 'Source', value: 'vector_db', variant: 'badge-info' },
      { label: 'Snippets', value: 5, variant: undefined },
      { label: 'Query', value: 'deployment guide', variant: undefined },
    ]);
  });

  it('extracts model.response fields', () => {
    const fields = extractStructuredFields('model.response', {
      modelProvider: 'openai',
      modelId: 'gpt-4',
      latencyMs: 2300,
    });
    expect(fields).toEqual([
      { label: 'Provider', value: 'openai', variant: 'badge-info' },
      { label: 'Model', value: 'gpt-4', variant: 'code' },
      { label: 'Latency', value: '2.3s', variant: undefined },
    ]);
  });

  it('extracts policy.violated fields', () => {
    const fields = extractStructuredFields('policy.violated', {
      policyName: 'max-tokens',
      result: 'blocked',
    });
    expect(fields).toEqual([
      { label: 'Policy', value: 'max-tokens', variant: 'code' },
      { label: 'Result', value: 'blocked', variant: undefined },
    ]);
  });

  it('skips undefined/null/empty values', () => {
    const fields = extractStructuredFields('run.start', {
      runName: null,
      triggerSource: undefined,
    });
    expect(fields).toEqual([]);
  });

  it('returns empty array for unknown event types', () => {
    const fields = extractStructuredFields('some.unknown.type', { foo: 'bar' });
    expect(fields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// EventDetailPanel component tests
// ---------------------------------------------------------------------------

describe('EventDetailPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Rendering --

  it('renders panel with event type badge and label', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Run Start')).toBeInTheDocument();
    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  it('renders truncated event ID', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('evt-abc1…')).toBeInTheDocument();
  });

  it('renders metadata grid with all core fields', () => {
    const entry = makeEntry({
      event: makeEvent({ sequence: 5, sourceFramework: 'langchain' }),
      depth: 2,
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Sequence')).toBeInTheDocument();
    expect(screen.getByText('#5')).toBeInTheDocument();
    expect(screen.getByText('Source Agent')).toBeInTheDocument();
    expect(screen.getByText('test-agent')).toBeInTheDocument();
    expect(screen.getByText('Framework')).toBeInTheDocument();
    expect(screen.getByText('langchain')).toBeInTheDocument();
    expect(screen.getByText('Depth')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders schema version', () => {
    const entry = makeEntry({ event: makeEvent({ schemaVersion: '1.0.0' }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Schema Version')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
  });

  it('renders framework as "—" when not set', () => {
    const entry = makeEntry({ event: makeEvent({ sourceFramework: null }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders parent event ID when present', () => {
    const entry = makeEntry({
      event: makeEvent({ parentEventId: 'parent-abc12345-6789' }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Parent Event')).toBeInTheDocument();
    expect(screen.getByText('parent-a…')).toBeInTheDocument();
  });

  it('hides parent event field when not present', () => {
    const entry = makeEntry({ event: makeEvent({ parentEventId: null }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Parent Event')).not.toBeInTheDocument();
  });

  it('renders duration badge when durationMs exists', () => {
    const entry = makeEntry({ durationMs: 1500 });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('hides duration when not set', () => {
    const entry = makeEntry({ durationMs: undefined });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  it('renders children count when present', () => {
    const entry = makeEntry({ childEventIds: ['c1', 'c2', 'c3'] });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('3 child event(s)')).toBeInTheDocument();
  });

  it('hides children field when empty', () => {
    const entry = makeEntry({ childEventIds: [] });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Children')).not.toBeInTheDocument();
  });

  // -- Structured fields --

  it('renders type-specific structured detail fields for tool.call.start', () => {
    const entry = makeEntry({
      event: makeEvent({
        type: 'tool.call.start',
        payload: { toolName: 'web-search', toolId: 'tool-99' },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
    expect(screen.getByText('web-search')).toBeInTheDocument();
    expect(screen.getByText('Tool ID')).toBeInTheDocument();
    expect(screen.getByText('tool-99')).toBeInTheDocument();
  });

  it('renders structured fields for run.end with success', () => {
    const entry = makeEntry({
      event: makeEvent({
        type: 'run.end',
        payload: { status: 'success', durationMs: 30000, summary: 'All done' },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Details')).toBeInTheDocument();
    const statusBadge = screen.getByText('success');
    expect(statusBadge.closest('[data-variant="success"]')).toBeInTheDocument();
  });

  it('does not render Details section for unknown event types', () => {
    const entry = makeEntry({
      event: makeEvent({ type: 'custom', payload: { foo: 'bar' } }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Details')).not.toBeInTheDocument();
  });

  // -- Tags --

  it('renders tags when present', () => {
    const entry = makeEntry({
      event: makeEvent({ tags: { env: 'production', team: 'platform' } }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('env: production')).toBeInTheDocument();
    expect(screen.getByText('team: platform')).toBeInTheDocument();
  });

  it('hides tags section when tags are empty', () => {
    const entry = makeEntry({ event: makeEvent({ tags: {} }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
  });

  // -- Redacted fields --

  it('shows redacted field indicator when payload contains [REDACTED]', () => {
    const entry = makeEntry({
      event: makeEvent({
        type: 'prompt.input',
        payload: { role: 'user', content: '[REDACTED]' },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('1 redacted field')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows plural redacted fields indicator', () => {
    const entry = makeEntry({
      event: makeEvent({
        type: 'prompt.input',
        payload: { content: '[REDACTED]', apiKey: '[REDACTED]', role: 'user' },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('2 redacted fields')).toBeInTheDocument();
    expect(screen.getByText('content, apiKey')).toBeInTheDocument();
  });

  it('shows nested redacted field paths', () => {
    const entry = makeEntry({
      event: makeEvent({
        payload: { config: { secret: '[REDACTED]' } },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('1 redacted field')).toBeInTheDocument();
    expect(screen.getByText('config.secret')).toBeInTheDocument();
  });

  it('does not show redacted indicator when no fields are redacted', () => {
    const entry = makeEntry({
      event: makeEvent({ payload: { safe: 'data' } }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByLabelText('Redacted fields warning')).not.toBeInTheDocument();
  });

  // -- Payload and raw metadata --

  it('renders JsonViewer for payload', () => {
    const entry = makeEntry({
      event: makeEvent({ payload: { toolName: 'search' } }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Payload')).toBeInTheDocument();
    const viewers = screen.getAllByTestId('json-viewer');
    expect(viewers[0]).toHaveTextContent('"toolName":"search"');
  });

  it('renders JsonViewer for raw metadata when present', () => {
    const entry = makeEntry({
      event: makeEvent({ rawMeta: { vendor: 'openai', apiVersion: '2024-01' } }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('Raw Metadata')).toBeInTheDocument();
    const viewers = screen.getAllByTestId('json-viewer');
    expect(viewers).toHaveLength(2); // payload + rawMeta
  });

  it('hides raw metadata section when rawMeta is null', () => {
    const entry = makeEntry({ event: makeEvent({ rawMeta: null }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Raw Metadata')).not.toBeInTheDocument();
  });

  it('hides raw metadata section when rawMeta is empty object', () => {
    const entry = makeEntry({ event: makeEvent({ rawMeta: {} }) });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.queryByText('Raw Metadata')).not.toBeInTheDocument();
  });

  // -- Copy buttons --

  it('copies event ID to clipboard on id button click', async () => {
    const user = userEvent.setup();
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    const copyBtn = screen.getByLabelText('Copy event ID');
    await user.click(copyBtn);

    // The clipboard write resolves and triggers a "Copied!" state change,
    // proving the navigator.clipboard.writeText call succeeded.
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('shows "Copied!" feedback after copying ID', async () => {
    const user = userEvent.setup();
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    const copyBtn = screen.getByLabelText('Copy event ID');
    await user.click(copyBtn);

    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('copies full event JSON to clipboard', async () => {
    const user = userEvent.setup();
    const event = makeEvent({ type: 'tool.call.start', payload: { toolName: 'search' } });
    const entry = makeEntry({ event });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    const copyJsonBtn = screen.getByLabelText('Copy event JSON');
    await user.click(copyJsonBtn);

    // The clipboard write resolves and triggers a "Copied!" state change,
    // proving the navigator.clipboard.writeText call succeeded.
    await waitFor(() => {
      expect(screen.getByLabelText('Copy event JSON')).toHaveTextContent('Copied!');
    });
  });

  it('shows "Copied!" feedback on Copy JSON button', async () => {
    const user = userEvent.setup();
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    const copyJsonBtn = screen.getByLabelText('Copy event JSON');
    expect(copyJsonBtn).toHaveTextContent('Copy JSON');
    await user.click(copyJsonBtn);
    expect(copyJsonBtn).toHaveTextContent('Copied!');
  });

  // -- Close button --

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    const closeBtn = screen.getByLabelText('Close event detail');
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledOnce();
  });

  // -- Accessibility --

  it('has region role with label', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByRole('region', { name: 'Event detail' })).toBeInTheDocument();
  });

  it('has aria-label on the close button', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByLabelText('Close event detail')).toBeInTheDocument();
  });

  it('has aria-label on copy event ID button', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByLabelText('Copy event ID')).toBeInTheDocument();
  });

  it('has aria-label on copy JSON button', () => {
    const entry = makeEntry();
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByLabelText('Copy event JSON')).toBeInTheDocument();
  });

  it('redacted warning has role=status', () => {
    const entry = makeEntry({
      event: makeEvent({
        payload: { secret: '[REDACTED]' },
      }),
    });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByRole('status', { name: 'Redacted fields warning' })).toBeInTheDocument();
  });

  // -- CSS class --

  it('applies custom className', () => {
    const entry = makeEntry();
    const { container } = render(
      <EventDetailPanel entry={entry} onClose={onClose} className="custom-class" />,
    );

    expect(container.firstElementChild).toHaveClass('custom-class');
  });

  it('applies slide-in animation class', () => {
    const entry = makeEntry();
    const { container } = render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(container.firstElementChild).toHaveClass('animate-slide-in-right');
  });

  // -- Duration formatting --

  it('formats millisecond durations', () => {
    const entry = makeEntry({ durationMs: 500 });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('formats second durations', () => {
    const entry = makeEntry({ durationMs: 2500 });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });

  it('formats minute durations', () => {
    const entry = makeEntry({ durationMs: 125000 });
    render(<EventDetailPanel entry={entry} onClose={onClose} />);

    expect(screen.getByText('2m 5s')).toBeInTheDocument();
  });
});
