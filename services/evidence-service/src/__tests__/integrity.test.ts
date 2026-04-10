import { describe, it, expect } from 'vitest';
import type { TraceReplayEvent, EventId, RunId, TenantId, EventType } from '@tracereplay/event-schema';

import type { EvidenceBundle, BundleId } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';
import {
  deterministicStringify,
  computeEventHash,
  computeIntegrityChain,
  verifyIntegrityChain,
} from '../integrity.js';
import type { IntegrityChainEntry } from '../integrity.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BUNDLE_ID = 'f0000001-0000-4000-8000-000000000001';
const RUN_ID = 'b0000001-0000-4000-8000-000000000001';
const TENANT_ID = 'tenant-test-001';

function makeEvent(
  index: number,
  type: EventType = 'tool.call' as EventType,
  payload: Record<string, unknown> = { tool: `tool-${index}` },
): TraceReplayEvent {
  return {
    id: `a0000001-0000-4000-8000-00000000000${index}` as EventId,
    runId: RUN_ID as RunId,
    type,
    timestamp: `2026-03-15T10:00:0${index}.000Z`,
    sequence: index,
    tenantId: TENANT_ID as TenantId,
    sourceAgent: 'test-agent',
    sourceFramework: 'custom',
    payload,
    tags: ['test'],
    schemaVersion: '1.0.0',
  } as TraceReplayEvent;
}

function makeBundleWithChain(
  events: TraceReplayEvent[],
  chain: IntegrityChainEntry[] | null,
  rootHash: string | null,
): EvidenceBundle {
  return {
    id: BUNDLE_ID as BundleId,
    runId: RUN_ID,
    tenantId: TENANT_ID,
    status: 'complete',
    createdAt: '2026-03-15T10:00:00.000Z',
    completedAt: '2026-03-15T10:00:05.000Z',
    runMetadata: null,
    events,
    timeline: null,
    lineageGraph: null,
    redactionAudit: { totalRedactedFields: 0, eventRedactions: [] },
    isPartialRun: false,
    partialRunMarker: null,
    errorMessage: null,
    integrityChain: chain,
    rootIntegrityHash: rootHash,
    bundleSchemaVersion: BUNDLE_SCHEMA_VERSION,
  } as EvidenceBundle;
}

// ---------------------------------------------------------------------------
// deterministicStringify
// ---------------------------------------------------------------------------

describe('deterministicStringify', () => {
  it('sorts object keys alphabetically', () => {
    const a = deterministicStringify({ z: 1, a: 2, m: 3 });
    const b = deterministicStringify({ a: 2, m: 3, z: 1 });
    expect(a).toBe(b);
    expect(JSON.parse(a)).toEqual({ a: 2, m: 3, z: 1 });
  });

  it('sorts nested object keys', () => {
    const a = deterministicStringify({ outer: { z: 1, a: 2 } });
    const b = deterministicStringify({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    const result = deterministicStringify([3, 1, 2]);
    expect(result).toBe('[3,1,2]');
  });

  it('handles null and primitives', () => {
    expect(deterministicStringify(null)).toBe('null');
    expect(deterministicStringify(42)).toBe('42');
    expect(deterministicStringify('hello')).toBe('"hello"');
  });
});

// ---------------------------------------------------------------------------
// computeEventHash
// ---------------------------------------------------------------------------

describe('computeEventHash', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const event = makeEvent(1);
    const hash = computeEventHash(event, '');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different events', () => {
    const event1 = makeEvent(1);
    const event2 = makeEvent(2);
    const hash1 = computeEventHash(event1, '');
    const hash2 = computeEventHash(event2, '');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different previous hashes', () => {
    const event = makeEvent(1);
    const hash1 = computeEventHash(event, '');
    const hash2 = computeEventHash(event, 'abc123');
    expect(hash1).not.toBe(hash2);
  });

  it('is deterministic (same input → same output)', () => {
    const event = makeEvent(1);
    const hash1 = computeEventHash(event, 'prev');
    const hash2 = computeEventHash(event, 'prev');
    expect(hash1).toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// computeIntegrityChain
// ---------------------------------------------------------------------------

describe('computeIntegrityChain', () => {
  it('returns empty chain and empty root for zero events', () => {
    const result = computeIntegrityChain([]);
    expect(result.chain).toEqual([]);
    expect(result.rootHash).toBe('');
  });

  it('builds a single-event chain', () => {
    const events = [makeEvent(1)];
    const result = computeIntegrityChain(events);

    expect(result.chain).toHaveLength(1);
    expect(result.chain[0]!.eventId).toBe(events[0]!.id);
    expect(result.chain[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.rootHash).toBe(result.chain[0]!.hash);
  });

  it('builds a multi-event chain where each hash depends on the previous', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const result = computeIntegrityChain(events);

    expect(result.chain).toHaveLength(3);

    // The first event should hash with empty previous
    const expectedFirst = computeEventHash(events[0]!, '');
    expect(result.chain[0]!.hash).toBe(expectedFirst);

    // The second event should hash with the first event's hash
    const expectedSecond = computeEventHash(events[1]!, expectedFirst);
    expect(result.chain[1]!.hash).toBe(expectedSecond);

    // The third event should hash with the second event's hash
    const expectedThird = computeEventHash(events[2]!, expectedSecond);
    expect(result.chain[2]!.hash).toBe(expectedThird);

    // Root hash is the last hash
    expect(result.rootHash).toBe(expectedThird);
  });

  it('is deterministic', () => {
    const events = [makeEvent(1), makeEvent(2)];
    const result1 = computeIntegrityChain(events);
    const result2 = computeIntegrityChain(events);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// verifyIntegrityChain
// ---------------------------------------------------------------------------

describe('verifyIntegrityChain', () => {
  it('returns valid for a correct chain', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const { chain, rootHash } = computeIntegrityChain(events);
    const bundle = makeBundleWithChain(events, chain, rootHash);

    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(true);
    expect(result.brokenAtIndex).toBeNull();
    expect(result.brokenAtEventId).toBeNull();
    expect(result.expectedHash).toBeNull();
    expect(result.actualHash).toBeNull();
  });

  it('returns valid for an empty bundle with no chain', () => {
    const bundle = makeBundleWithChain([], null, null);
    const result = verifyIntegrityChain(bundle);
    expect(result.valid).toBe(true);
  });

  it('detects missing chain on a non-empty bundle', () => {
    const events = [makeEvent(1)];
    const bundle = makeBundleWithChain(events, null, null);

    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
    expect(result.expectedHash).toBe('chain_missing');
  });

  it('detects a tampered event in the middle', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const { chain, rootHash } = computeIntegrityChain(events);

    // Tamper with the second event's payload
    const tamperedEvents = [...events];
    tamperedEvents[1] = {
      ...events[1]!,
      payload: { tool: 'TAMPERED' },
    } as TraceReplayEvent;

    const bundle = makeBundleWithChain(tamperedEvents, chain, rootHash);
    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
    expect(result.brokenAtEventId).toBe(tamperedEvents[1]!.id);
    expect(result.expectedHash).not.toBe(result.actualHash);
  });

  it('detects chain length mismatch', () => {
    const events = [makeEvent(1), makeEvent(2)];
    const { chain, rootHash } = computeIntegrityChain(events);

    // Bundle has 3 events but chain has 2
    const extraEvents = [...events, makeEvent(3)];
    const bundle = makeBundleWithChain(extraEvents, chain, rootHash);

    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(false);
    expect(result.expectedHash).toBe('length:3');
    expect(result.actualHash).toBe('length:2');
  });

  it('detects a tampered root hash', () => {
    const events = [makeEvent(1), makeEvent(2)];
    const { chain } = computeIntegrityChain(events);

    const bundle = makeBundleWithChain(events, chain, 'badhash');
    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(1);
  });

  it('detects a tampered first event', () => {
    const events = [makeEvent(1), makeEvent(2)];
    const { chain, rootHash } = computeIntegrityChain(events);

    // Tamper with the first event
    const tamperedEvents = [...events];
    tamperedEvents[0] = {
      ...events[0]!,
      payload: { tool: 'TAMPERED' },
    } as TraceReplayEvent;

    const bundle = makeBundleWithChain(tamperedEvents, chain, rootHash);
    const result = verifyIntegrityChain(bundle);

    expect(result.valid).toBe(false);
    expect(result.brokenAtIndex).toBe(0);
  });
});
