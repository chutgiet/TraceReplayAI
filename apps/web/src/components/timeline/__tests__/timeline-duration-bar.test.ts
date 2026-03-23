import { describe, it, expect } from 'vitest';
import { computeMaxDuration } from '../timeline-duration-bar';
import type { TimelineEntry } from '@/lib/api';

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    event: {
      id: 'evt-1',
      runId: 'run-1',
      tenantId: 'tenant-1',
      type: 'tool.call.start',
      timestamp: '2026-03-15T10:00:00.000Z',
      sequence: 1,
      parentEventId: null,
      sourceAgent: 'agent-1',
      sourceFramework: null,
      payload: { toolName: 'search' },
      rawMeta: null,
      tags: {},
      schemaVersion: '1.0.0',
      receivedAt: '2026-03-15T10:00:00.000Z',
    },
    index: 0,
    depth: 0,
    childEventIds: [],
    ...overrides,
  };
}

describe('computeMaxDuration', () => {
  it('returns totalDurationMs when provided and positive', () => {
    const entries = [makeEntry({ durationMs: 500 })];
    expect(computeMaxDuration(entries, 2000)).toBe(2000);
  });

  it('falls back to max entry durationMs when totalDurationMs is undefined', () => {
    const entries = [
      makeEntry({ durationMs: 100 }),
      makeEntry({ index: 1, durationMs: 500 }),
      makeEntry({ index: 2, durationMs: 200 }),
    ];
    expect(computeMaxDuration(entries, undefined)).toBe(500);
  });

  it('returns undefined when no durations exist', () => {
    const entries = [makeEntry(), makeEntry({ index: 1 })];
    expect(computeMaxDuration(entries, undefined)).toBeUndefined();
  });

  it('returns undefined for zero totalDurationMs and no entry durations', () => {
    const entries = [makeEntry()];
    expect(computeMaxDuration(entries, 0)).toBeUndefined();
  });
});
