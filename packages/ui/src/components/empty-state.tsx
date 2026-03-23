import { cn } from '../utils';
import type { BaseComponentProps } from '../types';

export interface EmptyStateProps extends BaseComponentProps {
  /** Main heading text. */
  title: string;
  /** Descriptive text below the heading. */
  description?: string;
  /** Optional icon element rendered above the title. */
  icon?: React.ReactNode;
  /** Optional action element (button/link) below the description. */
  action?: React.ReactNode;
}

/** A placeholder shown when a view has no data to display. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center',
        className,
      )}
      role="status"
    >
      {icon && (
        <div className="mb-4 text-[var(--color-text-muted)]">{icon}</div>
      )}
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--color-text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
