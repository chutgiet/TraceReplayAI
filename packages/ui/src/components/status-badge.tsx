import { Badge } from './badge';
import type { BadgeVariant, RunStatus } from '../types';

const STATUS_CONFIG: Record<RunStatus, { label: string; variant: BadgeVariant }> = {
  running: { label: 'Running', variant: 'info' },
  success: { label: 'Success', variant: 'success' },
  failure: { label: 'Failure', variant: 'error' },
  timeout: { label: 'Timeout', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
};

export interface StatusBadgeProps {
  status: RunStatus;
  className?: string;
}

/** Displays a run status as a color-coded badge. */
export function StatusBadge({ status, className }: StatusBadgeProps): React.JSX.Element {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: 'default' as BadgeVariant };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
