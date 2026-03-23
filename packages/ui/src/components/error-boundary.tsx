import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI rendered when an error is caught. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches rendering errors in child components and displays a fallback UI.
 * Provides a reset mechanism to retry rendering.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to structured logging in production; console for development.
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    const { fallback, children } = this.props;

    if (error) {
      if (typeof fallback === 'function') {
        return fallback(error, this.handleReset);
      }
      if (fallback) {
        return fallback;
      }
      return <DefaultErrorFallback error={error} onReset={this.handleReset} />;
    }

    return children;
  }
}

function DefaultErrorFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950"
    >
      <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
        Something went wrong
      </h3>
      <p className="max-w-md text-center text-xs text-red-600 dark:text-red-400">
        {error.message}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 transition-colors hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
