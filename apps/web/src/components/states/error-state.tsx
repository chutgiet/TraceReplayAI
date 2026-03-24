'use client';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// ErrorState — reusable data-fetching error display with retry
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  /** Title displayed at the top of the error card. */
  title?: string;
  /** Error object or message string. */
  error: Error | string | unknown;
  /** Callback fired when the user clicks "Try again". */
  onRetry?: () => void;
  /** Whether a retry is currently in progress. */
  isRetrying?: boolean;
  /** Additional class names. */
  className?: string;
  /** Compact mode for inline usage (smaller padding). */
  compact?: boolean;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

/**
 * Displays a styled error card with the error message and an optional retry button.
 * Used consistently across all data-fetching views.
 */
export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  isRetrying,
  className,
  compact,
}: ErrorStateProps): React.JSX.Element {
  const message = extractMessage(error);

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-red-200 bg-red-50 text-center dark:border-red-800 dark:bg-red-950',
        compact ? 'p-4' : 'p-6',
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-2">
        <span className="text-2xl" aria-hidden="true">⚠️</span>
        <h3
          className={cn(
            'font-semibold text-red-800 dark:text-red-200',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            'text-red-600 dark:text-red-400',
            compact ? 'text-xs' : 'text-xs',
          )}
        >
          {message}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className={cn(
              'mt-2 rounded-md bg-red-100 px-4 py-1.5 text-xs font-medium text-red-800',
              'transition-colors hover:bg-red-200',
              'dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isRetrying ? 'Retrying…' : 'Try again'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FullPageError — centered error for full-page error boundaries
// ---------------------------------------------------------------------------

export interface FullPageErrorProps {
  error: Error;
  reset: () => void;
}

/**
 * Full-page error fallback for Next.js error.tsx boundaries.
 * Centered vertically with prominent retry action.
 */
export function FullPageError({ error, reset }: FullPageErrorProps): React.JSX.Element {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <span className="text-4xl" aria-hidden="true">⚠️</span>
        <h1 className="mt-4 text-xl font-bold text-[var(--color-text-primary)]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {error.message || 'An unexpected error occurred while loading this page.'}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            Try again
          </button>
          <a
            href="/runs"
            className="text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            Go to runs
          </a>
        </div>
      </div>
    </div>
  );
}
