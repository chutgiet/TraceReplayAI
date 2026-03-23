import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../components/empty-state';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No runs found" />);
    expect(screen.getByText('No runs found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adjusting filters" />);
    expect(screen.getByText('Try adjusting filters')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="icon">📁</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Create run</button>}
      />,
    );
    expect(screen.getByText('Create run')).toBeInTheDocument();
  });

  it('has status role', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('omits description element when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('centers content', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain('items-center');
    expect(wrapper.className).toContain('text-center');
  });
});
