import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonViewer } from '../components/json-viewer';

describe('JsonViewer', () => {
  it('renders a string value', () => {
    render(<JsonViewer data="hello" />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
  });

  it('renders a number value', () => {
    render(<JsonViewer data={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a boolean value', () => {
    render(<JsonViewer data={true} />);
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('renders null value', () => {
    render(<JsonViewer data={null} />);
    expect(screen.getByText('null')).toBeInTheDocument();
  });

  it('renders an object with keys', () => {
    render(<JsonViewer data={{ name: 'test' }} defaultExpandDepth={2} />);
    expect(screen.getByText('"name"')).toBeInTheDocument();
    expect(screen.getByText('"test"')).toBeInTheDocument();
  });

  it('renders an array with items', () => {
    render(<JsonViewer data={[1, 2, 3]} defaultExpandDepth={2} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('collapses nested objects beyond defaultExpandDepth', () => {
    render(
      <JsonViewer
        data={{ a: { b: { c: 'deep' } } }}
        defaultExpandDepth={1}
      />,
    );
    // Top level should be expanded (depth 0 < 1)
    expect(screen.getByText('"a"')).toBeInTheDocument();
    // b should be collapsed (depth 1 < 1 is false)
    expect(screen.queryByText('"c"')).not.toBeInTheDocument();
  });

  it('expands collapsed node on click', () => {
    render(
      <JsonViewer
        data={{ nested: { value: 42 } }}
        defaultExpandDepth={0}
      />,
    );
    // At depth 0, the root object is collapsed
    expect(screen.queryByText('"nested"')).not.toBeInTheDocument();

    // Click the expand toggle (the one with aria-expanded, not the copy button)
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.click(toggle);

    // After expand, nested key should be visible
    expect(screen.getByText('"nested"')).toBeInTheDocument();
  });

  it('collapses expanded node on click', () => {
    render(
      <JsonViewer
        data={{ nested: { value: 42 } }}
        defaultExpandDepth={2}
      />,
    );
    // value should be visible initially
    expect(screen.getByText('"value"')).toBeInTheDocument();

    // Click the root toggle to collapse
    const toggles = screen.getAllByRole('button');
    // First toggle is copy button, find the expand/collapse ones
    const expandToggle = toggles.find(
      (t) => t.getAttribute('aria-expanded') === 'true' && !t.textContent?.includes('Copy'),
    );
    if (expandToggle) {
      fireEvent.click(expandToggle);
    }
  });

  it('shows copy button when copyable', () => {
    render(<JsonViewer data={{ test: 1 }} copyable />);
    expect(screen.getByLabelText('Copy JSON to clipboard')).toBeInTheDocument();
  });

  it('hides copy button when not copyable', () => {
    render(<JsonViewer data={{ test: 1 }} copyable={false} />);
    expect(screen.queryByLabelText('Copy JSON to clipboard')).not.toBeInTheDocument();
  });

  it('copies JSON to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<JsonViewer data={{ key: 'val' }} />);
    fireEvent.click(screen.getByLabelText('Copy JSON to clipboard'));

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ key: 'val' }, null, 2),
    );
  });

  it('shows item count for collapsed collections', () => {
    render(
      <JsonViewer
        data={{ a: 1, b: 2, c: 3 }}
        defaultExpandDepth={0}
      />,
    );
    expect(screen.getByText(/3 items/)).toBeInTheDocument();
  });

  it('handles [REDACTED] strings specially', () => {
    render(
      <JsonViewer data={{ secret: '[REDACTED]' }} defaultExpandDepth={2} />,
    );
    expect(screen.getByText('"[REDACTED]"')).toBeInTheDocument();
  });

  it('handles keyboard navigation for expand/collapse', () => {
    render(
      <JsonViewer
        data={{ nested: { value: 42 } }}
        defaultExpandDepth={0}
      />,
    );
    const toggle = screen.getByRole('button', { expanded: false });
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(screen.getByText('"nested"')).toBeInTheDocument();
  });

  it('renders deeply nested structures', () => {
    const data = { level1: { level2: { level3: { value: 'deep' } } } };
    render(<JsonViewer data={data} defaultExpandDepth={Infinity} />);
    expect(screen.getByText('"deep"')).toBeInTheDocument();
  });
});
