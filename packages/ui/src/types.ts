import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Shared component prop types
// ---------------------------------------------------------------------------

/** Common props shared by many UI components. */
export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
}

/** Sort direction for data tables. */
export type SortDirection = 'asc' | 'desc';

/** Column definition for DataTable. */
export interface ColumnDef<T> {
  /** Unique key for the column. */
  key: string;
  /** Display header label. */
  header: string;
  /** Render function for cell content. */
  render: (row: T) => ReactNode;
  /** Whether this column is sortable. */
  sortable?: boolean;
  /** Optional CSS class for the column header/cells. */
  className?: string;
}

/** Pagination state for DataTable. */
export interface PaginationState {
  /** Current page index (0-based). */
  pageIndex: number;
  /** Number of items per page. */
  pageSize: number;
  /** Total number of items (if known). */
  totalItems?: number;
}

/** Sort state for DataTable. */
export interface SortState {
  /** Column key being sorted. */
  column: string;
  /** Sort direction. */
  direction: SortDirection;
}

/** Badge variant types aligned with TraceReplay domain concepts. */
export type BadgeVariant =
  | 'default'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'muted';

/** Run status values from the domain model. */
export type RunStatus = 'running' | 'success' | 'failure' | 'timeout' | 'cancelled';
