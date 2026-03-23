import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../components/badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>label</Badge>);
    expect(screen.getByText('label')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    const { container } = render(<Badge>default</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-gray-100');
  });

  it('applies success variant', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-green-100');
  });

  it('applies error variant', () => {
    const { container } = render(<Badge variant="error">err</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-red-100');
  });

  it('applies warning variant', () => {
    const { container } = render(<Badge variant="warning">warn</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-amber-100');
  });

  it('applies info variant', () => {
    const { container } = render(<Badge variant="info">info</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-blue-100');
  });

  it('applies muted variant', () => {
    const { container } = render(<Badge variant="muted">muted</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('bg-gray-50');
  });

  it('merges custom className', () => {
    const { container } = render(<Badge className="ml-2">custom</Badge>);
    const el = container.firstElementChild!;
    expect(el.className).toContain('ml-2');
  });

  it('renders as a span element', () => {
    const { container } = render(<Badge>tag</Badge>);
    expect(container.firstElementChild!.tagName).toBe('SPAN');
  });
});
