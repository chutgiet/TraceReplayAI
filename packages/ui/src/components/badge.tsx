import { cn } from '../utils';
import type { BadgeVariant, BaseComponentProps } from '../types';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  muted: 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400',
};

export interface BadgeProps extends BaseComponentProps {
  variant?: BadgeVariant;
}

/** A compact label for categorization or status display. */
export function Badge({
  variant = 'default',
  className,
  children,
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
