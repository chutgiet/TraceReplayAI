import { createHash } from 'node:crypto';

import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type { EvidenceBundle } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single link in the integrity hash chain. */
export interface IntegrityChainEntry {
  /** The event ID this hash covers. */
  eventId: string;
  /** SHA-256 hash of (eventId + timestamp + payload + previousHash). */
  hash: string;
}

/** Result of computing an integrity chain over a set of events. */
export interface IntegrityChainResult {
  /** Per-event hash chain entries in chronological order. */
  chain: IntegrityChainEntry[];
  /** Root hash — the final hash in the chain (covers all events). */
  rootHash: string;
}

/** Result of verifying a bundle's integrity chain. */
export interface IntegrityVerifyResult {
  /** Whether the entire chain is valid. */
  valid: boolean;
  /** Index of the first broken link (null if valid). */
  brokenAtIndex: number | null;
  /** Event ID at the break point (null if valid). */
  brokenAtEventId: string | null;
  /** Expected hash at the break point (null if valid). */
  expectedHash: string | null;
  /** Actual hash stored at the break point (null if valid). */
  actualHash: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic JSON string with keys sorted recursively at every
 * level. Ensures the same logical object always produces the same string
 * regardless of property insertion order.
 */
export function deterministicStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Compute the hash for a single event in the chain.
 *
 * hash = SHA-256( eventId || timestamp || deterministicStringify(payload) || previousHash )
 *
 * The first event uses an empty string as previousHash (genesis block).
 */
export function computeEventHash(
  event: TraceReplayEvent,
  previousHash: string,
): string {
  const payloadStr = deterministicStringify(event.payload);
  const input = `${event.id}|${event.timestamp}|${payloadStr}|${previousHash}`;
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Chain computation
// ---------------------------------------------------------------------------

/**
 * Compute the integrity hash chain for an ordered list of events.
 *
 * Events must be in chronological order (same order as stored in the bundle).
 * Each event's hash depends on the previous event's hash, creating an
 * tamper-evident chain similar to a blockchain.
 *
 * Returns an empty chain with empty-string root for zero events.
 */
export function computeIntegrityChain(events: TraceReplayEvent[]): IntegrityChainResult {
  if (events.length === 0) {
    return { chain: [], rootHash: '' };
  }

  const chain: IntegrityChainEntry[] = [];
  let previousHash = '';

  for (const event of events) {
    const hash = computeEventHash(event, previousHash);
    chain.push({ eventId: event.id, hash });
    previousHash = hash;
  }

  return {
    chain,
    rootHash: previousHash,
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify the integrity chain stored in a bundle.
 *
 * Re-computes the chain from the bundle's events and compares against
 * the stored chain entries. Returns details about the first broken link
 * if the chain is invalid.
 */
export function verifyIntegrityChain(bundle: EvidenceBundle): IntegrityVerifyResult {
  const storedChain = bundle.integrityChain;

  // No chain to verify (e.g. bundles created before integrity was added)
  if (!storedChain || storedChain.length === 0) {
    if (bundle.events.length === 0) {
      return { valid: true, brokenAtIndex: null, brokenAtEventId: null, expectedHash: null, actualHash: null };
    }
    return {
      valid: false,
      brokenAtIndex: 0,
      brokenAtEventId: bundle.events[0]?.id ?? null,
      expectedHash: 'chain_missing',
      actualHash: null,
    };
  }

  // Chain length must match events
  if (storedChain.length !== bundle.events.length) {
    return {
      valid: false,
      brokenAtIndex: Math.min(storedChain.length, bundle.events.length),
      brokenAtEventId: null,
      expectedHash: `length:${bundle.events.length}`,
      actualHash: `length:${storedChain.length}`,
    };
  }

  // Re-compute and compare
  let previousHash = '';

  for (let i = 0; i < bundle.events.length; i++) {
    const event = bundle.events[i]!;
    const stored = storedChain[i]!;
    const expectedHash = computeEventHash(event, previousHash);

    if (stored.hash !== expectedHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        brokenAtEventId: event.id,
        expectedHash,
        actualHash: stored.hash,
      };
    }

    previousHash = expectedHash;
  }

  // Also verify root hash matches
  if (bundle.rootIntegrityHash && bundle.rootIntegrityHash !== previousHash) {
    return {
      valid: false,
      brokenAtIndex: bundle.events.length - 1,
      brokenAtEventId: bundle.events[bundle.events.length - 1]?.id ?? null,
      expectedHash: previousHash,
      actualHash: bundle.rootIntegrityHash,
    };
  }

  return { valid: true, brokenAtIndex: null, brokenAtEventId: null, expectedHash: null, actualHash: null };
}
