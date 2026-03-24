'use client';

import { Skeleton } from '@tracereplay/ui';

// ---------------------------------------------------------------------------
// Run list table skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the runs list table with header and rows. */
export function RunListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      {/* Table header */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3">
        <div className="flex gap-8">
          {['w-20', 'w-28', 'w-16', 'w-32', 'w-16', 'w-12'].map((w, i) => (
            <Skeleton key={i} width={w} height="h-3" />
          ))}
        </div>
      </div>
      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-8 border-b border-[var(--color-border)] px-4 py-3 last:border-0"
        >
          <Skeleton width="w-20" height="h-4" />
          <Skeleton width="w-28" height="h-4" />
          <Skeleton width="w-16" height="h-4" />
          <Skeleton width="w-32" height="h-4" />
          <Skeleton width="w-16" height="h-4" />
          <Skeleton width="w-12" height="h-4" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run detail header skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the run detail header with breadcrumb, stats, and tabs. */
export function RunDetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading run details">
      {/* Breadcrumb */}
      <Skeleton width="w-32" height="h-4" />

      {/* Header card */}
      <div className="rounded-lg border border-[var(--color-border)] p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton width="w-72" height="h-6" />
            <Skeleton width="w-48" height="h-4" />
          </div>
          <Skeleton width="w-20" height="h-7" className="rounded-full" />
        </div>
        <div className="mt-6 grid grid-cols-4 gap-4 border-t border-[var(--color-border)] pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton width="w-12" height="h-3" />
              <Skeleton width="w-20" height="h-4" className="mt-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-[var(--color-border)] pb-2">
        <Skeleton width="w-20" height="h-4" />
        <Skeleton width="w-20" height="h-4" />
        <Skeleton width="w-20" height="h-4" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run overview (events list) skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the run overview events list. */
export function RunEventsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading events">
      <Skeleton width="w-28" height="h-4" />
      <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton width="w-8" height="h-4" />
            <Skeleton width="w-28" height="h-5" />
            <Skeleton width="w-32" height="h-4" className="flex-1" />
            <Skeleton width="w-36" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the replay timeline view with summary header and entries. */
export function TimelineSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading timeline">
      {/* Section heading */}
      <div className="space-y-1">
        <Skeleton width="w-40" height="h-6" />
        <Skeleton width="w-64" height="h-4" />
      </div>

      {/* Summary bar */}
      <div className="flex gap-6 rounded-lg border border-[var(--color-border)] p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton width="w-12" height="h-3" />
            <Skeleton width="w-16" height="h-5" />
          </div>
        ))}
      </div>

      {/* Timeline entries */}
      <div className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3">
            <Skeleton width="w-4" height="h-4" circle />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-3">
                <Skeleton width="w-24" height="h-4" />
                <Skeleton width="w-36" height="h-3" />
              </div>
              <Skeleton width="w-full" height="h-2" />
            </div>
            <Skeleton width="w-28" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lineage graph skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the lineage graph view with summary bar and canvas. */
export function LineageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading lineage graph">
      {/* Section heading */}
      <div className="space-y-1">
        <Skeleton width="w-48" height="h-6" />
        <Skeleton width="w-72" height="h-4" />
      </div>

      {/* Summary bar */}
      <div className="flex gap-6 rounded-lg border border-[var(--color-border)] p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton width="w-4" height="h-4" circle />
            <Skeleton width="w-16" height="h-3" />
          </div>
        ))}
      </div>

      {/* Graph canvas placeholder */}
      <div className="relative h-[600px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* Fake node placeholders */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-12">
              <Skeleton width="w-28" height="h-12" />
              <Skeleton width="w-28" height="h-12" />
            </div>
            <Skeleton width="w-28" height="h-12" />
            <div className="flex gap-12">
              <Skeleton width="w-28" height="h-12" />
              <Skeleton width="w-28" height="h-12" />
              <Skeleton width="w-28" height="h-12" />
            </div>
          </div>
        </div>

        {/* Controls placeholder */}
        <div className="absolute right-3 top-3 space-y-1">
          <Skeleton width="w-8" height="h-8" />
          <Skeleton width="w-8" height="h-8" />
          <Skeleton width="w-8" height="h-8" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search results skeleton
// ---------------------------------------------------------------------------

/** Skeleton for search result cards. */
export function SearchResultsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading search results">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--color-border)] p-4"
        >
          <div className="flex items-center gap-2">
            <Skeleton width="w-6" height="h-5" />
            <Skeleton width="w-24" height="h-4" />
            <Skeleton width="w-32" height="h-3" className="ml-auto" />
          </div>
          <div className="mt-2 space-y-1">
            <Skeleton width="w-full" height="h-3" />
            <Skeleton width="w-3/4" height="h-3" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Skeleton width="w-20" height="h-3" />
            <Skeleton width="w-24" height="h-3" />
            <Skeleton width="w-16" height="h-3" className="ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event detail panel skeleton
// ---------------------------------------------------------------------------

/** Skeleton for the event detail side panel. */
export function EventDetailSkeleton() {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
      role="status"
      aria-label="Loading event details"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Skeleton width="w-20" height="h-5" />
          <Skeleton width="w-16" height="h-3" />
        </div>
        <Skeleton width="w-6" height="h-6" />
      </div>
      {/* Metadata fields */}
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton width="w-16" height="h-3" />
            <Skeleton width="w-40" height="h-4" className="mt-1" />
          </div>
        ))}
        {/* JSON block */}
        <div className="mt-4 rounded border border-[var(--color-border)] p-3 space-y-2">
          <Skeleton width="w-full" height="h-3" />
          <Skeleton width="w-5/6" height="h-3" />
          <Skeleton width="w-4/6" height="h-3" />
          <Skeleton width="w-full" height="h-3" />
          <Skeleton width="w-3/4" height="h-3" />
        </div>
      </div>
    </div>
  );
}
