import { clsx, type ClassValue } from 'clsx';

/** Merge class names, filtering out falsy values. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format a duration in milliseconds to a human-readable string. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

/** Format an ISO timestamp as a locale-friendly string with timezone. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/** Map event type prefixes to CSS classes for color-coding. */
export function eventTypeClass(type: string): string {
  if (type.startsWith('prompt.')) return 'event-prompt';
  if (type.startsWith('tool.call.')) return 'event-tool-call';
  if (type.startsWith('run.error') || type.endsWith('.error'))
    return 'event-error';
  if (type.startsWith('side_effect.')) return 'event-side-effect';
  if (type.startsWith('approval.')) return 'event-approval';
  if (type.startsWith('context.')) return 'event-context';
  if (type.startsWith('model.')) return 'event-model';
  if (type.startsWith('policy.')) return 'event-policy';
  if (type.startsWith('run.')) return 'event-run';
  return '';
}

/** Map run status to a display-friendly label color. */
export function statusColor(
  status: string,
): { bg: string; text: string } {
  switch (status) {
    case 'success':
      return { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' };
    case 'failure':
      return { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' };
    case 'running':
      return { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' };
    case 'timeout':
      return { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200' };
    case 'cancelled':
      return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-800 dark:text-gray-200' };
    default:
      return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300' };
  }
}
