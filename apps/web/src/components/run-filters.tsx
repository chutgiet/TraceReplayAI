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

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Status filter */}
      <div className="space-y-1">
        <label
          htmlFor="status-filter"
          className="text-xs font-medium text-[var(--color-text-secondary)]"
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
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Agent ID filter */}
      <div className="space-y-1">
        <label
          htmlFor="agent-filter"
          className="text-xs font-medium text-[var(--color-text-secondary)]"
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

      {/* Clear filters */}
      {(filters.status || filters.agentId) && (
        <button
          onClick={() => {
            setAgentId('');
            onChange({});
          }}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
