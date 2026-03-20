import { describe, it, expect } from 'vitest';
import type { TraceReplayEvent, EventType } from '@tracereplay/event-schema';
import { validateEvent, SCHEMA_VERSION, EVENT_TYPES } from '@tracereplay/event-schema';
import { buildTimeline } from '@tracereplay/replay-engine';
import {
  loadFixture,
  loadFixtureRaw,
  loadAllFixtures,
  FIXTURE_NAMES,
  type FixtureName,
} from '../index.js';

// ---------------------------------------------------------------------------
// Schema validation — all fixtures must pass Zod validation
// ---------------------------------------------------------------------------

describe('Fixture schema validation', () => {
  for (const name of FIXTURE_NAMES) {
    describe(name, () => {
      it('loads without error', () => {
        const events = loadFixture(name);
        expect(events.length).toBeGreaterThan(0);
      });

      it('every event has schemaVersion matching current SCHEMA_VERSION', () => {
        const events = loadFixture(name);
        for (const event of events) {
          expect(event.schemaVersion).toBe(SCHEMA_VERSION);
        }
      });

      it('every event has a valid event type', () => {
        const events = loadFixture(name);
        const validTypes = new Set<string>(EVENT_TYPES);
        for (const event of events) {
          expect(validTypes.has(event.type)).toBe(true);
        }
      });

      it('all events share the same runId', () => {
        const events = loadFixture(name);
        const runIds = new Set(events.map((e) => e.runId));
        expect(runIds.size).toBe(1);
      });

      it('all events share the same tenantId', () => {
        const events = loadFixture(name);
        const tenantIds = new Set(events.map((e) => e.tenantId));
        expect(tenantIds.size).toBe(1);
      });

      it('every event has a unique id', () => {
        const events = loadFixture(name);
        const ids = events.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('raw JSON roundtrips through Zod validation', () => {
        const raw = loadFixtureRaw(name);
        for (let i = 0; i < raw.length; i++) {
          const result = validateEvent(raw[i]);
          expect(result.success, `Event at index ${i} failed validation`).toBe(true);
        }
      });
    });
  }

  it('loadAllFixtures loads all 5 fixtures', () => {
    const all = loadAllFixtures();
    expect(Object.keys(all)).toHaveLength(5);
    for (const name of FIXTURE_NAMES) {
      expect(all[name].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Replay engine — verify each fixture produces correct timeline behaviour
// ---------------------------------------------------------------------------

describe('Fixture replay correctness', () => {
  // -----------------------------------------------------------------------
  // 1. simple-chat-run
  // -----------------------------------------------------------------------
  describe('simple-chat-run', () => {
    let events: TraceReplayEvent[];

    it('loads the fixture', () => {
      events = loadFixture('simple-chat-run');
      expect(events).toHaveLength(6);
    });

    it('produces a complete timeline with no gaps', () => {
      const timeline = buildTimeline(events);

      expect(timeline.entries).toHaveLength(6);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.hasGaps).toBe(false);
    });

    it('events are in chronological order', () => {
      const timeline = buildTimeline(events);

      const expectedOrder: EventType[] = [
        'run.start',
        'prompt.input',
        'model.request',
        'model.response',
        'prompt.output',
        'run.end',
      ];
      expect(timeline.entries.map((e) => e.event.type)).toEqual(expectedOrder);
    });

    it('summary reflects a successful chat run', () => {
      const { summary } = buildTimeline(events);

      expect(summary.status).toBe('success');
      expect(summary.eventCount).toBe(6);
      expect(summary.toolCount).toBe(0);
      expect(summary.hasErrors).toBe(false);
      expect(summary.durationMs).toBe(2500);
    });
  });

  // -----------------------------------------------------------------------
  // 2. multi-tool-run
  // -----------------------------------------------------------------------
  describe('multi-tool-run', () => {
    let events: TraceReplayEvent[];

    it('loads the fixture', () => {
      events = loadFixture('multi-tool-run');
      expect(events).toHaveLength(15);
    });

    it('produces a complete timeline with no gaps', () => {
      const timeline = buildTimeline(events);

      expect(timeline.entries).toHaveLength(15);
      expect(timeline.gaps).toHaveLength(0);
      expect(timeline.summary.hasGaps).toBe(false);
    });

    it('counts 2 distinct tools', () => {
      const { summary } = buildTimeline(events);
      expect(summary.toolCount).toBe(2);
    });

    it('computes paired duration for web-search tool call', () => {
      const timeline = buildTimeline(events);

      const wsStart = timeline.entries.find(
        (e) => e.event.type === 'tool.call.start' && e.event.payload.toolName === 'web-search',
      );
      // web-search: 11:00:03.000 → 11:00:05.200 = 2200ms
      expect(wsStart?.durationMs).toBe(2200);
    });

    it('computes paired duration for calculator tool call', () => {
      const timeline = buildTimeline(events);

      const calcStart = timeline.entries.find(
        (e) => e.event.type === 'tool.call.start' && e.event.payload.toolName === 'calculator',
      );
      // calculator: 11:00:05.500 → 11:00:05.600 = 100ms
      expect(calcStart?.durationMs).toBe(100);
    });

    it('includes context, side effect, policy, and annotation events', () => {
      const { summary } = buildTimeline(events);

      expect(summary.eventTypeCounts['context.retrieved']).toBe(1);
      expect(summary.eventTypeCounts['context.injected']).toBe(1);
      expect(summary.eventTypeCounts['side_effect.executed']).toBe(1);
      expect(summary.eventTypeCounts['policy.evaluated']).toBe(1);
      expect(summary.eventTypeCounts['annotation']).toBe(1);
    });

    it('resolves causal link from context.injected to context.retrieved', () => {
      const timeline = buildTimeline(events);

      const injected = timeline.entries.find((e) => e.event.type === 'context.injected');
      expect(injected?.depth).toBe(1);
      expect(injected?.event.parentEventId).toBeDefined();
    });

    it('summary reflects a successful multi-tool run', () => {
      const { summary } = buildTimeline(events);

      expect(summary.status).toBe('success');
      expect(summary.durationMs).toBe(7000);
      expect(summary.hasErrors).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. error-run
  // -----------------------------------------------------------------------
  describe('error-run', () => {
    let events: TraceReplayEvent[];

    it('loads the fixture', () => {
      events = loadFixture('error-run');
      expect(events).toHaveLength(9);
    });

    it('summary reflects a failed run with errors', () => {
      const { summary } = buildTimeline(events);

      expect(summary.status).toBe('failure');
      expect(summary.hasErrors).toBe(true);
      expect(summary.durationMs).toBe(6000);
    });

    it('detects no gaps (tool error properly closes the call)', () => {
      const timeline = buildTimeline(events);
      // tool.call.error closes the tool.call.start, so no unclosed_tool_call gap
      expect(timeline.gaps).toHaveLength(0);
    });

    it('has both run.error and tool.call.error events', () => {
      const { summary } = buildTimeline(events);

      expect(summary.eventTypeCounts['run.error']).toBe(1);
      expect(summary.eventTypeCounts['tool.call.error']).toBe(1);
      expect(summary.eventTypeCounts['side_effect.failed']).toBe(1);
    });

    it('computes paired duration for the failed tool call', () => {
      const timeline = buildTimeline(events);

      const toolStart = timeline.entries.find((e) => e.event.type === 'tool.call.start');
      // db-query: 12:00:03.000 → 12:00:05.000 = 2000ms
      expect(toolStart?.durationMs).toBe(2000);
    });
  });

  // -----------------------------------------------------------------------
  // 4. partial-telemetry-run
  // -----------------------------------------------------------------------
  describe('partial-telemetry-run', () => {
    let events: TraceReplayEvent[];

    it('loads the fixture', () => {
      events = loadFixture('partial-telemetry-run');
      expect(events).toHaveLength(5);
    });

    it('detects missing run.start gap', () => {
      const { gaps } = buildTimeline(events);
      expect(gaps.some((g) => g.type === 'missing_run_start')).toBe(true);
    });

    it('detects missing run.end gap', () => {
      const { gaps } = buildTimeline(events);
      expect(gaps.some((g) => g.type === 'missing_run_end')).toBe(true);
    });

    it('detects orphan tool.call.end (no matching start)', () => {
      const { gaps } = buildTimeline(events);
      expect(gaps.some((g) => g.type === 'orphan_tool_end')).toBe(true);
    });

    it('summary reflects gaps and missing status', () => {
      const { summary } = buildTimeline(events);

      expect(summary.hasGaps).toBe(true);
      expect(summary.status).toBeUndefined();
    });

    it('sorts out-of-order events chronologically', () => {
      const timeline = buildTimeline(events);

      // Events arrive out of order (model.response at seq 4 has earlier timestamp
      // than tool.call.end at seq 7) — verify sorted by timestamp
      for (let i = 1; i < timeline.entries.length; i++) {
        const prev = timeline.entries[i - 1]!.event.timestamp;
        const curr = timeline.entries[i]!.event.timestamp;
        expect(curr >= prev).toBe(true);
      }
    });

    it('handles sequence gaps (3, 4, 5, 7, 9)', () => {
      const events = loadFixture('partial-telemetry-run');
      const sequences = events
        .map((e) => e.sequence)
        .filter((s): s is number => s !== undefined);
      expect(sequences).toEqual([3, 5, 7, 4, 9]);
    });
  });

  // -----------------------------------------------------------------------
  // 5. approval-denied-run
  // -----------------------------------------------------------------------
  describe('approval-denied-run', () => {
    let events: TraceReplayEvent[];

    it('loads the fixture', () => {
      events = loadFixture('approval-denied-run');
      expect(events).toHaveLength(12);
    });

    it('produces a timeline with no gaps (approval is resolved)', () => {
      const timeline = buildTimeline(events);
      // The approval.denied event has parentEventId pointing to approval.requested,
      // so the approval is considered resolved
      expect(timeline.gaps.some((g) => g.type === 'unclosed_approval')).toBe(false);
    });

    it('summary reflects a cancelled run', () => {
      const { summary } = buildTimeline(events);

      expect(summary.status).toBe('cancelled');
      expect(summary.hasErrors).toBe(false);
      expect(summary.toolCount).toBe(0);
    });

    it('includes all governance event types', () => {
      const { summary } = buildTimeline(events);

      expect(summary.eventTypeCounts['approval.requested']).toBe(1);
      expect(summary.eventTypeCounts['approval.denied']).toBe(1);
      expect(summary.eventTypeCounts['policy.evaluated']).toBe(1);
      expect(summary.eventTypeCounts['policy.violated']).toBe(1);
      expect(summary.eventTypeCounts['annotation']).toBe(1);
      expect(summary.eventTypeCounts['custom']).toBe(1);
    });

    it('resolves causal link from approval.denied to approval.requested', () => {
      const timeline = buildTimeline(events);

      const denied = timeline.entries.find((e) => e.event.type === 'approval.denied');
      expect(denied?.depth).toBe(1);
      expect(denied?.event.parentEventId).toBeDefined();
    });

    it('approval duration reflects real-world wait time', () => {
      const events = loadFixture('approval-denied-run');
      const deniedEvent = events.find((e) => e.type === 'approval.denied');

      expect(deniedEvent?.type === 'approval.denied' && deniedEvent.payload.durationMs).toBe(330000);
    });

    it('has a long total duration due to human approval wait', () => {
      const { summary } = buildTimeline(events);
      // 14:00:00 → 14:05:33 = 333_000ms
      expect(summary.durationMs).toBe(333000);
    });
  });
});
