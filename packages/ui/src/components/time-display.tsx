import { cn } from '../utils';

export interface TimeDisplayProps {
  /** ISO 8601 timestamp string. */
  timestamp: string | null | undefined;
  /** Display format. */
  format?: 'full' | 'short' | 'relative' | 'time-only';
  className?: string;
}

/** Formats and displays a timestamp with timezone awareness. */
export function TimeDisplay({
  timestamp,
  format = 'full',
  className,
}: TimeDisplayProps): React.JSX.Element {
  if (!timestamp) {
    return (
      <span className={cn('text-[var(--color-text-muted)]', className)}>—</span>
    );
  }

  const date = new Date(timestamp);
  const formatted = formatDate(date, format);

  return (
    <time
      dateTime={timestamp}
      title={date.toISOString()}
      className={cn('tabular-nums', className)}
    >
      {formatted}
    </time>
  );
}

function formatDate(date: Date, format: TimeDisplayProps['format']): string {
  switch (format) {
    case 'short':
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    case 'time-only':
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    case 'relative':
      return formatRelative(date);
    case 'full':
    default:
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
  }
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'just now';
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
