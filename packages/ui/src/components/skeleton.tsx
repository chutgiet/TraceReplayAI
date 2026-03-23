import { cn } from '../utils';

export interface SkeletonProps {
  className?: string;
  /** Width override (e.g. "w-32", "w-full"). Defaults to "w-full". */
  width?: string;
  /** Height override (e.g. "h-4", "h-8"). Defaults to "h-4". */
  height?: string;
  /** Render as circular (for avatar placeholders). */
  circle?: boolean;
}

/** An animated placeholder shown while content is loading. */
export function Skeleton({
  className,
  width = 'w-full',
  height = 'h-4',
  circle,
}: SkeletonProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'animate-pulse bg-gray-200 dark:bg-gray-700',
        circle ? 'rounded-full' : 'rounded-md',
        width,
        height,
        className,
      )}
    />
  );
}

/** A group of skeleton lines for loading a card or section. */
export function SkeletonGroup({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="Loading content">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}
