import { cn } from '../utils';
import type { BaseComponentProps } from '../types';

export interface CardProps extends BaseComponentProps {
  /** Optional heading for the card. */
  title?: string;
  /** Optional subheading or description. */
  description?: string;
  /** Content rendered in a card footer area. */
  footer?: React.ReactNode;
  /** Remove default padding (for embedded tables, etc.). */
  noPadding?: boolean;
}

/** A bordered container for grouping related content. */
export function Card({
  title,
  description,
  footer,
  noPadding,
  className,
  children,
}: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]',
        className,
      )}
    >
      {(title || description) && (
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          {title && (
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
      {footer && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
