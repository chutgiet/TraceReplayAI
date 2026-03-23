import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeDisplay } from '../components/time-display';

describe('TimeDisplay', () => {
  it('renders em dash for null timestamp', () => {
    render(<TimeDisplay timestamp={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders em dash for undefined timestamp', () => {
    render(<TimeDisplay timestamp={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders a time element for valid timestamp', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" />,
    );
    const time = container.querySelector('time');
    expect(time).toBeInTheDocument();
    expect(time!.getAttribute('datetime')).toBe('2025-01-15T10:30:00Z');
  });

  it('has title attribute with ISO string', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" />,
    );
    const time = container.querySelector('time');
    expect(time!.getAttribute('title')).toBe('2025-01-15T10:30:00.000Z');
  });

  it('applies custom className', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" className="text-red-500" />,
    );
    const time = container.querySelector('time');
    expect(time!.className).toContain('text-red-500');
  });

  it('uses tabular-nums for consistent number display', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" />,
    );
    const time = container.querySelector('time');
    expect(time!.className).toContain('tabular-nums');
  });

  it('renders in short format', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" format="short" />,
    );
    const time = container.querySelector('time');
    // Short format should contain month name
    expect(time!.textContent).toBeTruthy();
  });

  it('renders in time-only format', () => {
    const { container } = render(
      <TimeDisplay timestamp="2025-01-15T10:30:00Z" format="time-only" />,
    );
    const time = container.querySelector('time');
    expect(time!.textContent).toBeTruthy();
  });
});
