'use client';

import { useState } from 'react';
import type { RunListParams } from '@/lib/api';

const STATUS_OPTIONS = ['running', 'success', 'failure', 'timeout', 'cancelled'] as const;

export function RunFilters({
  filters,
  onChange,
}: {
  filters: RunListParams;
  onChange: (filters: RunListParams) => void;
}) {
  const [agentId, setAgentId] = useState(filters.agentId ?? '');

  const hasActiveFilters = !!(
    filters.status ||
    filters.agentId ||
    filters.startedAfter ||
    filters.startedBefore
  );

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Status filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="status-filter"
            className="block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Status
          </label>
          <select
            id="status-filter"
            value={filters.status ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                status: e.target.value || undefined,
                cursor: undefined,
              })
            }
            className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Agent ID filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="agent-filter"
            className="block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Agent ID
          </label>
          <input
            id="agent-filter"
            type="text"
            placeholder="Filter by agent…"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            onBlur={() =>
              onChange({
                ...filters,
                agentId: agentId || undefined,
                cursor: undefined,
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onChange({
                  ...filters,
                  agentId: agentId || undefined,
                  cursor: undefined,
                });
              }
            }}
            className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
          />
        </div>

        {/* Started after filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="started-after-filter"
            className="block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Started after
          </label>
          <input
            id="started-after-filter"
            type="datetime-local"
            value={filters.startedAfter ? toLocalDatetimeValue(filters.startedAfter) : ''}
            onChange={(e) =>
              onChange({
                ...filters,
                startedAfter: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
                cursor: undefined,
              })
            }
            className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
          />
        </div>

        {/* Started before filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="started-before-filter"
            className="block text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Started before
          </label>
          <input
            id="started-before-filter"
            type="datetime-local"
            value={filters.startedBefore ? toLocalDatetimeValue(filters.startedBefore) : ''}
            onChange={(e) =>
              onChange({
                ...filters,
                startedBefore: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
                cursor: undefined,
              })
            }
            className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
          />
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setAgentId('');
              onChange({});
            }}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text-secondary)]"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

/** Convert an ISO string to the value format required by datetime-local input (YYYY-MM-DDThh:mm). */
function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
