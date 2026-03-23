import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../components/card';

describe('Card', () => {
  it('renders children content', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Card title="Title">body</Card>);
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Card title="T" description="Desc">body</Card>);
    expect(screen.getByText('Desc')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(<Card footer={<span>Footer</span>}>body</Card>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('does not render header section without title or description', () => {
    const { container } = render(<Card>plain</Card>);
    const borders = container.querySelectorAll('.border-b');
    // No header border separator
    expect(borders.length).toBe(0);
  });

  it('removes padding with noPadding prop', () => {
    const { container } = render(<Card noPadding>content</Card>);
    // The body div should not have p-4
    const bodyDiv = container.querySelector('div > div')!;
    expect(bodyDiv.className).not.toContain('p-4');
  });

  it('adds padding by default', () => {
    const { container } = render(<Card>content</Card>);
    // The body wrapper is the direct child div of the root card div
    const rootDiv = container.firstElementChild!;
    const bodyDiv = rootDiv.firstElementChild!;
    expect(bodyDiv.className).toContain('p-4');
  });

  it('merges custom className', () => {
    const { container } = render(<Card className="mt-6">x</Card>);
    expect(container.firstElementChild!.className).toContain('mt-6');
  });
});
