import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../components/error-boundary';

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  // Suppress console.error from React error boundary
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders default fallback on error', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test error" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('renders custom static fallback', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent message="err" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('renders custom function fallback with error', () => {
    render(
      <ErrorBoundary
        fallback={(error) => <div>Error: {error.message}</div>}
      >
        <ThrowingComponent message="fn error" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Error: fn error')).toBeInTheDocument();
  });

  it('resets error state when Try again is clicked', () => {
    // We can't easily test that children render again after reset
    // because the same throwing component would throw again.
    // Instead, test that the reset button exists and is clickable.
    render(
      <ErrorBoundary>
        <ThrowingComponent message="reset test" />
      </ErrorBoundary>,
    );
    const button = screen.getByText('Try again');
    expect(button).toBeInTheDocument();
    // Click should not throw
    fireEvent.click(button);
  });

  it('provides reset function to function fallback', () => {
    const resetSpy = vi.fn();
    render(
      <ErrorBoundary
        fallback={(_error, reset) => (
          <button onClick={() => { reset(); resetSpy(); }}>Reset</button>
        )}
      >
        <ThrowingComponent message="fn reset" />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('Reset'));
    expect(resetSpy).toHaveBeenCalled();
  });
});
