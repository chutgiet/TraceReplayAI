import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/status-badge';

describe('StatusBadge', () => {
  it('renders "Running" for running status', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders "Success" for success status', () => {
    render(<StatusBadge status="success" />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('renders "Failure" for failure status', () => {
    render(<StatusBadge status="failure" />);
    expect(screen.getByText('Failure')).toBeInTheDocument();
  });

  it('renders "Timeout" for timeout status', () => {
    render(<StatusBadge status="timeout" />);
    expect(screen.getByText('Timeout')).toBeInTheDocument();
  });

  it('renders "Cancelled" for cancelled status', () => {
    render(<StatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('applies info variant classes for running', () => {
    const { container } = render(<StatusBadge status="running" />);
    expect(container.firstElementChild!.className).toContain('bg-blue-100');
  });

  it('applies success variant classes for success', () => {
    const { container } = render(<StatusBadge status="success" />);
    expect(container.firstElementChild!.className).toContain('bg-green-100');
  });

  it('applies error variant classes for failure', () => {
    const { container } = render(<StatusBadge status="failure" />);
    expect(container.firstElementChild!.className).toContain('bg-red-100');
  });

  it('merges custom className', () => {
    const { container } = render(<StatusBadge status="success" className="ml-4" />);
    expect(container.firstElementChild!.className).toContain('ml-4');
  });
});
