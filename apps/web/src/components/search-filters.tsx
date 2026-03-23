'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import type { SearchParams } from '@/lib/api';

const EVENT_TYPE_GROUPS = [
  { label: 'Run lifecycle', types: ['run.start', 'run.end', 'run.error'] },
  { label: 'Prompts', types: ['prompt.input', 'prompt.output'] },
  { label: 'Context', types: ['context.retrieved', 'context.injected'] },
  { label: 'Tool calls', types: ['tool.call.start', 'tool.call.end', 'tool.call.error'] },
  { label: 'Approvals', types: ['approval.requested', 'approval.granted', 'approval.denied'] },
  { label: 'Side effects', types: ['side_effect.executed', 'side_effect.failed'] },
  { label: 'Model', types: ['model.request', 'model.response'] },
  { label: 'Policy', types: ['policy.evaluated', 'policy.violated'] },
  { label: 'Other', types: ['annotation', 'custom'] },
] as const;

function toLocalDatetimeValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SearchFilters({
  params,
  onSearch,
}: {
  params: SearchParams;
  onSearch: (params: SearchParams) => void;
}) {
  const [query, setQuery] = useState(params.q);
  const [runId, setRunId] = useState(params.runId ?? '');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    params.eventTypes ?? [],
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      onSearch({
        ...params,
        q: query.trim(),
        runId: runId || undefined,
        eventTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
        cursor: undefined,
      });
    },
    [query, runId, selectedTypes, params, onSearch],
  );

  const toggleEventType = useCallback(
    (type: string) => {
      setSelectedTypes((prev) =>
        prev.includes(type)
          ? prev.filter((t) => t !== type)
          : [...prev, type],
      );
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setRunId('');
    setSelectedTypes([]);
    onSearch({ q: query.trim(), cursor: undefined });
  }, [query, onSearch]);

  const hasAdvancedFilters = !!(
    runId ||
    selectedTypes.length > 0 ||
    params.after ||
    params.before
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          type="search"
          placeholder='Search events... (e.g. "error timeout", tool name, prompt content)'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-sm placeholder:text-[var(--color-text-muted)] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          autoFocus
        />
      </div>

      {/* Advanced toggle + submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          {showAdvanced ? 'Hide filters' : 'Advanced filters'}
          {hasAdvancedFilters && (
            <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
              !
            </span>
          )}
        </button>
        {hasAdvancedFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-red-500 hover:text-red-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Run ID filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="search-run-id"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Run ID
              </label>
              <input
                id="search-run-id"
                type="text"
                placeholder="Filter by run UUID..."
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-mono"
              />
            </div>

            {/* After filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="search-after"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                After
              </label>
              <input
                id="search-after"
                type="datetime-local"
                value={toLocalDatetimeValue(params.after)}
                onChange={(e) =>
                  onSearch({
                    ...params,
                    q: query.trim() || params.q,
                    after: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : undefined,
                    cursor: undefined,
                  })
                }
                className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              />
            </div>

            {/* Before filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="search-before"
                className="block text-xs font-medium text-[var(--color-text-secondary)]"
              >
                Before
              </label>
              <input
                id="search-before"
                type="datetime-local"
                value={toLocalDatetimeValue(params.before)}
                onChange={(e) =>
                  onSearch({
                    ...params,
                    q: query.trim() || params.q,
                    before: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : undefined,
                    cursor: undefined,
                  })
                }
                className="block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Event type chips */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              Event types
            </span>
            <div className="space-y-2">
              {EVENT_TYPE_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-24 text-xs text-[var(--color-text-muted)]">
                    {group.label}
                  </span>
                  {group.types.map((type) => {
                    const selected = selectedTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleEventType(type)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                            : 'bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
