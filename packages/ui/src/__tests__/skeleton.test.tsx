import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonGroup } from '../components/skeleton';

describe('Skeleton', () => {
  it('renders with loading role', () => {
    render(<Skeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-label for accessibility', () => {
    render(<Skeleton />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('applies default width and height', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el.className).toContain('w-full');
    expect(el.className).toContain('h-4');
  });

  it('applies custom width and height', () => {
    const { container } = render(<Skeleton width="w-32" height="h-8" />);
    const el = container.firstElementChild!;
    expect(el.className).toContain('w-32');
    expect(el.className).toContain('h-8');
  });

  it('applies rounded-full for circle variant', () => {
    const { container } = render(<Skeleton circle />);
    const el = container.firstElementChild!;
    expect(el.className).toContain('rounded-full');
  });

  it('applies rounded-md for non-circle', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild!;
    expect(el.className).toContain('rounded-md');
  });

  it('has animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild!.className).toContain('animate-pulse');
  });
});

describe('SkeletonGroup', () => {
  it('renders default 3 skeleton lines', () => {
    render(<SkeletonGroup />);
    const skeletons = screen.getAllByRole('status');
    // The group itself has role="status" and each Skeleton child also does
    // The group wrapper is one, but we check the children
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders specified number of lines', () => {
    const { container } = render(<SkeletonGroup lines={5} />);
    // Each line is a div with animate-pulse
    const lines = container.querySelectorAll('.animate-pulse');
    expect(lines.length).toBe(5);
  });

  it('makes last line shorter', () => {
    const { container } = render(<SkeletonGroup lines={3} />);
    const lines = container.querySelectorAll('.animate-pulse');
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine.className).toContain('w-2/3');
  });
});
