'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ReplayTimeline as ReplayTimelineData, TimelineEntry, TimelineGap } from '@/lib/api';
import { RunSummaryHeader } from './run-summary-header';
import { TimelineEntryRow } from './timeline-entry-row';
import { TimelineGapMarker } from './timeline-gap-marker';
import { DelegationPointMarker } from './delegation-point-marker';
import { EventDetailPanel } from './event-detail-panel';
import { computeMaxDuration } from './timeline-duration-bar';
import { TimelineEmptyState } from '@/components/states';

export interface ReplayTimelineViewProps {
  timeline: ReplayTimelineData;
  className?: string;
}

/**
 * Full replay timeline view.
 * Renders the run summary header, vertical timeline with chronological entries,
 * gap markers at their detected positions, and an inline event detail panel.
 */
export function ReplayTimelineView({
  timeline,
  className,
}: ReplayTimelineViewProps): React.JSX.Element {
  const { entries, gaps, summary, delegationPoints } = timeline;

  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null);

  const selectedEntry = selectedEntryIndex != null ? entries[selectedEntryIndex] ?? null : null;

  const maxDurationMs = useMemo(
    () => computeMaxDuration(entries, summary.durationMs),
    [entries, summary.durationMs],
  );

  // Build a map of gap positions for inline insertion.
  // Exclude gaps that will be rendered as standalone markers.
  const gapsByIndex = useMemo(() => {
    const map = new Map<number, TimelineGap[]>();
    for (const gap of gaps) {
      const idx = gap.detectedAtIndex ?? 0;
      const existing = map.get(idx);
      if (existing) {
        existing.push(gap);
      } else {
        map.set(idx, [gap]);
      }
    }
    return map;
  }, [gaps]);

  // Standalone gaps rendered outside the entry list
  const preGaps = useMemo(
    () => gaps.filter((g) => g.type === 'missing_run_start'),
    [gaps],
  );
  const postGaps = useMemo(
    () => gaps.filter((g) => g.type === 'missing_run_end'),
    [gaps],
  );
  // Inline gaps exclude the standalone ones
  const inlineGapFilter = useCallback(
    (gap: TimelineGap) => gap.type !== 'missing_run_start' && gap.type !== 'missing_run_end',
    [],
  );

  const handleSelect = useCallback((entry: TimelineEntry) => {
    setSelectedEntryIndex((prev) => (prev === entry.index ? null : entry.index));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedEntryIndex(null);
  }, []);

  if (entries.length === 0) {
    return <TimelineEmptyState />;
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Run summary bar */}
      <RunSummaryHeader summary={summary} gapCount={gaps.length} />

      {/* Main content: timeline + detail panel */}
      <div className="flex gap-4">
        {/* Timeline column */}
        <div className="min-w-0 flex-1">
          {/* Standalone pre-timeline gaps (e.g. missing_run_start) */}
          {preGaps.map((gap, i) => (
            <TimelineGapMarker key={`pre-gap-${i}`} gap={gap} className="mb-2" />
          ))}

          {/* Timeline entries */}
          <div
            className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]"
            role="list"
            aria-label="Replay timeline"
          >
            {entries.map((entry) => (
              <div key={entry.event.id} role="listitem">
                <TimelineEntryRow
                  entry={entry}
                  maxDurationMs={maxDurationMs}
                  isSelected={selectedEntryIndex === entry.index}
                  onSelect={handleSelect}
                />
                {/* Inline gap markers after this entry (excluding standalone types) */}
                {gapsByIndex.get(entry.index)?.filter(inlineGapFilter).map((gap, i) => (
                  <TimelineGapMarker
                    key={`gap-${entry.index}-${i}`}
                    gap={gap}
                    className="mx-4 my-2"
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Standalone post-timeline gaps (e.g. missing_run_end) */}
          {postGaps.map((gap, i) => (
            <TimelineGapMarker key={`post-gap-${i}`} gap={gap} className="mt-2" />
          ))}

          {/* Sub-agent delegation points */}
          {delegationPoints && delegationPoints.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                Sub-agent Delegations ({delegationPoints.length})
              </p>
              {delegationPoints.map((dp) => (
                <DelegationPointMarker
                  key={dp.childRunId}
                  delegationPoint={dp}
                />
              ))}
            </div>
          )}
        </div>

        {/* Event detail panel (responsive: side panel on lg, inline on smaller) */}
        {selectedEntry && (
          <div className="w-full lg:w-96 lg:shrink-0">
            <div className="sticky top-6">
              <EventDetailPanel
                entry={selectedEntry}
                onClose={handleCloseDetail}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
