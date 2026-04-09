import { describe, it, expect } from 'vitest';
import { formatRunEventsForPrompt, parseOllamaJson } from '../jobs/helpers.js';
import type { EventRow } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'evt-001',
    run_id: 'run-001',
    tenant_id: 'tenant-1',
    type: 'tool.call.start',
    sequence: 1,
    parent_event_id: null,
    source_agent: 'copilot',
    source_framework: null,
    payload: { toolName: 'read_file', toolInput: { path: '/test.ts' } },
    raw_meta: null,
    tags: [],
    schema_version: '1.0.0',
    timestamp: new Date('2026-04-08T10:00:00Z'),
    received_at: new Date('2026-04-08T10:00:01Z'),
    ingestion_order: 1,
    ...overrides,
  } as EventRow;
}

describe('formatRunEventsForPrompt', () => {
  it('formats events as numbered lines', () => {
    const events = [
      makeEvent({ id: 'evt-1', type: 'run.start' }),
      makeEvent({ id: 'evt-2', type: 'tool.call.start' }),
    ];

    const result = formatRunEventsForPrompt(events);
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('run.start');
    expect(result).toContain('tool.call.start');
  });

  it('truncates at maxEvents', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ id: `evt-${i}` }),
    );

    const result = formatRunEventsForPrompt(events, 3);
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('[3]');
    expect(result).not.toContain('[4]');
    expect(result).toContain('7 more events truncated');
  });

  it('truncates long payloads', () => {
    const longPayload = { data: 'x'.repeat(1000) };
    const events = [makeEvent({ payload: longPayload })];

    const result = formatRunEventsForPrompt(events);
    expect(result.length).toBeLessThan(800);
    expect(result).toContain('…');
  });
});

describe('parseOllamaJson', () => {
  it('parses plain JSON', () => {
    const result = parseOllamaJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const result = parseOllamaJson('```json\n{"key": "value"}\n```');
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON with DeepSeek think blocks', () => {
    const input = '<think>\nLet me analyze this...\n</think>\n{"key": "value"}';
    const result = parseOllamaJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('parses JSON with both think blocks and code fences', () => {
    const input = '<think>\nReasoning here\n</think>\n```json\n{"key": "value"}\n```';
    const result = parseOllamaJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseOllamaJson('not json at all')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseOllamaJson('')).toBeNull();
  });
});
