/**
 * Shared utilities for vendor adapter implementations.
 *
 * These helpers are vendor-neutral and used by all adapters built on
 * BaseAgentAdapter (or standalone). They handle safe field extraction,
 * branded-ID construction, timestamp normalization, status mapping,
 * and canonical event assembly.
 */

import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import type {
  EventId,
  RunId,
  TenantId,
  EventType,
  TraceReplayEvent,
} from '@tracereplay/event-schema';

// ---------------------------------------------------------------------------
// Branded-ID constructors
// ---------------------------------------------------------------------------

export function toEventId(id?: string): EventId {
  return (id ?? randomUUID()) as EventId;
}

export function toRunId(id?: string): RunId {
  return (id ?? randomUUID()) as RunId;
}

export function toTenantId(id: string): TenantId {
  return id as TenantId;
}

// ---------------------------------------------------------------------------
// Timestamp normalization
// ---------------------------------------------------------------------------

export function isoTimestamp(ts?: string): string {
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Safe field extraction helpers
//
// Accept variadic keys — tries each in order, returning the first match.
// This eliminates the `stringField(d, 'x') ?? stringField(d, 'y')` pattern.
// ---------------------------------------------------------------------------

export function stringField(
  data: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'string') return val;
  }
  return undefined;
}

export function numberField(
  data: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'number') return val;
  }
  return undefined;
}

export function objectField(
  data: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const val = data[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Status mapping — shared across all vendors
// ---------------------------------------------------------------------------

const SUCCESS_STATUSES = new Set([
  'completed', 'success', 'ok', 'done', 'passed', 'finished',
]);
const FAILURE_STATUSES = new Set([
  'failed', 'error', 'failure', 'errored',
]);
const TIMEOUT_STATUSES = new Set([
  'timeout', 'timed_out', 'deadline_exceeded',
]);
const CANCELLED_STATUSES = new Set([
  'cancelled', 'canceled', 'aborted', 'stopped',
]);

export function mapStatusToCanonical(
  status: string | undefined,
  fallback: 'success' | 'failure' | 'timeout' | 'cancelled' = 'success',
): 'success' | 'failure' | 'timeout' | 'cancelled' {
  if (!status) return fallback;
  const s = status.toLowerCase();
  if (SUCCESS_STATUSES.has(s)) return 'success';
  if (FAILURE_STATUSES.has(s)) return 'failure';
  if (TIMEOUT_STATUSES.has(s)) return 'timeout';
  if (CANCELLED_STATUSES.has(s)) return 'cancelled';
  return fallback;
}

const PASS_RESULTS = new Set([
  'pass', 'passed', 'ok', 'success', 'allow', 'allowed', 'approved',
]);
const FAIL_RESULTS = new Set([
  'fail', 'failed', 'deny', 'denied', 'block', 'blocked',
  'reject', 'rejected', 'violated', 'tripwire',
]);
const WARN_RESULTS = new Set([
  'warn', 'warning', 'flagged', 'review',
]);

export function mapPolicyResult(
  result: string | undefined,
): 'pass' | 'fail' | 'warn' | 'error' | 'skip' {
  if (!result) return 'pass';
  const r = result.toLowerCase();
  if (PASS_RESULTS.has(r)) return 'pass';
  if (FAIL_RESULTS.has(r)) return 'fail';
  if (WARN_RESULTS.has(r)) return 'warn';
  if (r === 'error') return 'error';
  if (r === 'skip' || r === 'skipped') return 'skip';
  return 'pass';
}

// ---------------------------------------------------------------------------
// Canonical event factory
// ---------------------------------------------------------------------------

export interface BaseEventFields {
  id: EventId;
  runId: RunId;
  tenantId: TenantId;
  timestamp: string;
  sourceAgent: string;
  parentEventId?: EventId;
  sequence?: number;
  rawMeta?: Record<string, unknown>;
}

export function createCanonicalEvent(
  type: EventType,
  payload: Record<string, unknown>,
  base: BaseEventFields,
  opts: { sourceFramework: string; tags: string[] },
): TraceReplayEvent {
  return {
    id: base.id,
    runId: base.runId,
    type,
    timestamp: base.timestamp,
    sequence: base.sequence,
    parentEventId: base.parentEventId,
    tenantId: base.tenantId,
    sourceAgent: base.sourceAgent,
    sourceFramework: opts.sourceFramework,
    payload,
    rawMeta: base.rawMeta,
    tags: opts.tags,
    schemaVersion: SCHEMA_VERSION,
  } as TraceReplayEvent;
}
