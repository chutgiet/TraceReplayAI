import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import { PassthroughAdapter } from '../passthrough-adapter.js';
import type { RawVendorEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCanonicalRaw(overrides?: Record<string, unknown>): RawVendorEvent {
  return {
    vendor: 'tracereplay',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    data: {
      id: 'a0000001-0000-4000-8000-000000000001',
      runId: 'b0000001-0000-4000-8000-000000000001',
      type: 'run.start',
      timestamp: '2026-03-15T10:00:00.000Z',
      tenantId: 'tenant-test-001',
      sourceAgent: 'test-agent',
      payload: { runName: 'test-run', triggerSource: 'user' },
      schemaVersion: SCHEMA_VERSION,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PassthroughAdapter', () => {
  const adapter = new PassthroughAdapter();

  describe('vendorId', () => {
    it('should be "tracereplay"', () => {
      expect(adapter.vendorId).toBe('tracereplay');
    });
  });

  describe('canHandle', () => {
    it('returns true for events with canonical BaseEvent structure', () => {
      const raw = makeCanonicalRaw();
      expect(adapter.canHandle(raw)).toBe(true);
    });

    it('returns false when missing required fields', () => {
      const raw: RawVendorEvent = {
        vendor: 'tracereplay',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { type: 'run.start' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });

    it('returns false for completely foreign data', () => {
      const raw: RawVendorEvent = {
        vendor: 'unknown',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { foo: 'bar' },
      };
      expect(adapter.canHandle(raw)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('passes through a valid canonical run.start event', () => {
      const raw = makeCanonicalRaw();
      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        const event = result.events[0]!;
        expect(event.type).toBe('run.start');
        expect(event.id).toBe('a0000001-0000-4000-8000-000000000001');
        expect(event.runId).toBe('b0000001-0000-4000-8000-000000000001');
        expect(event.tenantId).toBe('tenant-test-001');
      }
    });

    it('passes through a valid canonical tool.call.start event', () => {
      const raw = makeCanonicalRaw({
        id: 'a0000002-0000-4000-8000-000000000001',
        type: 'tool.call.start',
        payload: {
          toolName: 'search',
          inputParameters: { query: 'test' },
        },
      });
      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events[0]!.type).toBe('tool.call.start');
      }
    });

    it('returns error for invalid canonical event (missing required fields)', () => {
      const raw: RawVendorEvent = {
        vendor: 'tracereplay',
        tenantId: 'tenant-test-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: {
          id: 'a0000001-0000-4000-8000-000000000001',
          // missing runId, type, timestamp, etc.
          payload: {},
          schemaVersion: SCHEMA_VERSION,
        },
      };

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('Passthrough validation failed');
        expect(result.rawEvent).toBe(raw);
      }
    });

    it('returns error for invalid payload shape', () => {
      const raw = makeCanonicalRaw({
        type: 'run.end',
        payload: { status: 'INVALID_STATUS' },
      });

      const result = adapter.normalize(raw);
      expect(result.status).toBe('error');
    });

    it('preserves rawMeta when not already present', () => {
      const raw = makeCanonicalRaw();
      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events[0]!.rawMeta).toEqual({
          normalizedBy: 'tracereplay',
          receivedAt: '2026-03-15T10:00:00.000Z',
        });
      }
    });

    it('does not overwrite existing rawMeta', () => {
      const raw = makeCanonicalRaw({
        rawMeta: { existingKey: 'existingValue' },
      });
      const result = adapter.normalize(raw);

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events[0]!.rawMeta).toEqual({
          existingKey: 'existingValue',
        });
      }
    });
  });
});
