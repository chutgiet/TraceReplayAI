import { useCallback, useMemo, useState } from 'react';
import { cn } from '../utils';
import type { ColumnDef, PaginationState, SortDirection, SortState } from '../types';

export interface DataTableProps<T> {
  /** Column definitions. */
  columns: ColumnDef<T>[];
  /** Row data. */
  data: T[];
  /** Unique key extractor for each row. */
  rowKey: (row: T) => string;
  /** Optional external sort state (controlled). */
  sort?: SortState;
  /** Called when header click requests sort change. */
  onSortChange?: (sort: SortState) => void;
  /** Optional external pagination state (controlled). */
  pagination?: PaginationState;
  /** Called when page changes. */
  onPageChange?: (pageIndex: number) => void;
  /** Called when row is clicked. */
  onRowClick?: (row: T) => void;
  /** Whether data is currently loading. */
  loading?: boolean;
  /** CSS class for the wrapper. */
  className?: string;
  /** Accessible caption for the table. */
  caption?: string;
}

/**
 * A data table with sortable columns and pagination controls.
 * Supports both controlled (external) and uncontrolled (internal) sort/pagination.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  sort: externalSort,
  onSortChange,
  pagination: externalPagination,
  onPageChange,
  onRowClick,
  loading,
  className,
  caption,
}: DataTableProps<T>): React.JSX.Element {
  // Internal sort state (used when not controlled externally)
  const [internalSort, setInternalSort] = useState<SortState | null>(null);
  const activeSort = externalSort ?? internalSort;

  // Internal pagination state (used when not controlled externally)
  const [internalPage, setInternalPage] = useState(0);
  const pagination = externalPagination ?? { pageIndex: internalPage, pageSize: 10 };

  const handleSort = useCallback(
    (columnKey: string) => {
      const newDirection: SortDirection =
        activeSort?.column === columnKey && activeSort.direction === 'asc'
          ? 'desc'
          : 'asc';
      const newSort: SortState = { column: columnKey, direction: newDirection };

      if (onSortChange) {
        onSortChange(newSort);
      } else {
        setInternalSort(newSort);
      }
    },
    [activeSort, onSortChange],
  );

  const handlePageChange = useCallback(
    (pageIndex: number) => {
      if (onPageChange) {
        onPageChange(pageIndex);
      } else {
        setInternalPage(pageIndex);
      }
    },
    [onPageChange],
  );

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return data.slice(start, start + pagination.pageSize);
  }, [data, pagination.pageIndex, pagination.pageSize]);

  const totalPages = Math.ceil(
    (pagination.totalItems ?? data.length) / pagination.pageSize,
  );

  return (
    <div className={cn('overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--color-text-secondary)]',
                    col.sortable && 'cursor-pointer select-none hover:text-[var(--color-text-primary)]',
                    col.className,
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    activeSort?.column === col.key
                      ? activeSort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && activeSort?.column === col.key && (
                      <SortIndicator direction={activeSort.direction} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]"
                >
                  Loading…
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]"
                >
                  No data to display
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-[var(--color-border)] transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-[var(--color-surface-raised)]',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2', col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-3 py-2">
          <span className="text-xs text-[var(--color-text-muted)]">
            Page {pagination.pageIndex + 1} of {totalPages}
            {pagination.totalItems != null && (
              <> · {pagination.totalItems} items</>
            )}
          </span>
          <div className="flex gap-1">
            <PaginationButton
              disabled={pagination.pageIndex === 0}
              onClick={() => handlePageChange(pagination.pageIndex - 1)}
              label="Previous page"
            >
              ←
            </PaginationButton>
            <PaginationButton
              disabled={pagination.pageIndex >= totalPages - 1}
              onClick={() => handlePageChange(pagination.pageIndex + 1)}
              label="Next page"
            >
              →
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function SortIndicator({ direction }: { direction: SortDirection }): React.JSX.Element {
  return (
    <span aria-hidden="true" className="text-[10px]">
      {direction === 'asc' ? '▲' : '▼'}
    </span>
  );
}

function PaginationButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-[var(--color-text-muted)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-primary)]',
      )}
    >
      {children}
    </button>
  );
}
