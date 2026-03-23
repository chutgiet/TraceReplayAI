import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunFilters } from '@/components/run-filters';
import type { RunListParams } from '@/lib/api';

describe('RunFilters', () => {
  const defaultProps = {
    filters: {} as RunListParams,
    onChange: vi.fn(),
  };

  it('renders all filter fields', () => {
    render(<RunFilters {...defaultProps} />);

    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Agent ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Started after')).toBeInTheDocument();
    expect(screen.getByLabelText('Started before')).toBeInTheDocument();
  });

  it('shows all status options in dropdown', () => {
    render(<RunFilters {...defaultProps} />);

    const select = screen.getByLabelText('Status');
    const options = select.querySelectorAll('option');

    expect(options).toHaveLength(6); // All + 5 statuses
    expect(options[0]).toHaveTextContent('All statuses');
    expect(options[1]).toHaveTextContent('Running');
    expect(options[2]).toHaveTextContent('Success');
    expect(options[3]).toHaveTextContent('Failure');
    expect(options[4]).toHaveTextContent('Timeout');
    expect(options[5]).toHaveTextContent('Cancelled');
  });

  it('calls onChange when status is selected', async () => {
    const onChange = vi.fn();
    render(<RunFilters filters={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'running' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'running', cursor: undefined }),
    );
  });

  it('calls onChange with undefined status when "All statuses" is selected', () => {
    const onChange = vi.fn();
    render(<RunFilters filters={{ status: 'running' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, cursor: undefined }),
    );
  });

  it('calls onChange when agent ID is submitted via Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RunFilters filters={{}} onChange={onChange} />);

    const input = screen.getByLabelText('Agent ID');
    await user.type(input, 'my-agent{Enter}');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'my-agent', cursor: undefined }),
    );
  });

  it('calls onChange when agent ID loses focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RunFilters filters={{}} onChange={onChange} />);

    const input = screen.getByLabelText('Agent ID');
    await user.type(input, 'test-agent');
    await user.tab(); // blur

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'test-agent', cursor: undefined }),
    );
  });

  it('calls onChange when started after date is set', () => {
    const onChange = vi.fn();
    render(<RunFilters filters={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Started after'), {
      target: { value: '2026-03-15T10:00' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAfter: expect.stringContaining('2026-03-15'),
        cursor: undefined,
      }),
    );
  });

  it('calls onChange when started before date is set', () => {
    const onChange = vi.fn();
    render(<RunFilters filters={{}} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Started before'), {
      target: { value: '2026-03-20T18:00' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const calledWith = onChange.mock.calls[0]![0];
    expect(calledWith.startedBefore).toBeDefined();
    expect(calledWith.cursor).toBeUndefined();
  });

  it('does not show clear button when no filters are active', () => {
    render(<RunFilters filters={{}} onChange={vi.fn()} />);

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('shows clear button when status filter is active', () => {
    render(<RunFilters filters={{ status: 'running' }} onChange={vi.fn()} />);

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('shows clear button when agent filter is active', () => {
    render(
      <RunFilters filters={{ agentId: 'agent-1' }} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('shows clear button when date filter is active', () => {
    render(
      <RunFilters
        filters={{ startedAfter: '2026-03-15T10:00:00.000Z' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clears all filters when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RunFilters
        filters={{ status: 'running', agentId: 'agent-1' }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('Clear filters'));

    expect(onChange).toHaveBeenCalledWith({});
  });

  it('resets cursor when any filter changes', () => {
    const onChange = vi.fn();
    render(
      <RunFilters
        filters={{ cursor: 'some-cursor', status: 'running' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'failure' },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined }),
    );
  });
});
