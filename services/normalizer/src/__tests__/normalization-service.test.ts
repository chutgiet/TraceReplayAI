import { describe, it, expect, beforeEach } from 'vitest';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import type { RawVendorEvent } from '@tracereplay/connectors-core';
import { NormalizationService } from '../services/normalization-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePassthroughRaw(): RawVendorEvent {
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
    },
  };
}

function makeOpenAIRaw(): RawVendorEvent {
  return {
    vendor: 'openai-agents',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    runId: 'b0000001-0000-4000-8000-000000000001',
    data: {
      type: 'agent.start',
      trace_id: 'trace-001',
      span_id: 'a0000001-0000-4000-8000-000000000099',
      timestamp: '2026-03-15T10:00:00.000Z',
      agent_name: 'test-openai-agent',
      data: { name: 'my-agent' },
    },
  };
}

function makeUnknownVendorRaw(): RawVendorEvent {
  return {
    vendor: 'langchain',
    tenantId: 'tenant-test-001',
    receivedAt: '2026-03-15T10:00:00.000Z',
    data: { type: 'some.langchain.thing', data: {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NormalizationService', () => {
  let service: NormalizationService;

  beforeEach(() => {
    service = new NormalizationService();
  });

  describe('normalizeEvent', () => {
    it('normalizes a passthrough (canonical) event', () => {
      const result = service.normalizeEvent(makePassthroughRaw());

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        expect(result.events[0]!.type).toBe('run.start');
      }
    });

    it('normalizes an OpenAI Agents event', () => {
      const result = service.normalizeEvent(makeOpenAIRaw());

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.events).toHaveLength(1);
        expect(result.events[0]!.type).toBe('run.start');
        expect(result.events[0]!.sourceFramework).toBe('openai-agents');
      }
    });

    it('returns error for unknown vendor with no matching adapter', () => {
      const result = service.normalizeEvent(makeUnknownVendorRaw());

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toContain('No adapter found for vendor "langchain"');
      }
    });
  });

  describe('normalizeBatch', () => {
    it('normalizes a batch of mixed events', () => {
      const batch = [
        makePassthroughRaw(),
        makeOpenAIRaw(),
        makeUnknownVendorRaw(),
      ];

      const results = service.normalizeBatch(batch);

      expect(results).toHaveLength(3);
      expect(results[0]!.status).toBe('success');
      expect(results[1]!.status).toBe('success');
      expect(results[2]!.status).toBe('error');
    });
  });

  describe('stats tracking', () => {
    it('starts with zero stats', () => {
      const stats = service.getStats();
      expect(stats.processed).toBe(0);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.deadLettered).toBe(0);
    });

    it('increments processed and succeeded on success', () => {
      service.normalizeEvent(makePassthroughRaw());
      const stats = service.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(0);
    });

    it('increments processed and failed on error', () => {
      service.normalizeEvent(makeUnknownVendorRaw());
      const stats = service.getStats();
      expect(stats.processed).toBe(1);
      expect(stats.succeeded).toBe(0);
      expect(stats.failed).toBe(1);
    });

    it('increments deadLettered when recorded', () => {
      service.recordDeadLetter();
      service.recordDeadLetter();
      const stats = service.getStats();
      expect(stats.deadLettered).toBe(2);
    });

    it('tracks stats across multiple operations', () => {
      service.normalizeEvent(makePassthroughRaw());
      service.normalizeEvent(makeOpenAIRaw());
      service.normalizeEvent(makeUnknownVendorRaw());
      service.recordDeadLetter();

      const stats = service.getStats();
      expect(stats.processed).toBe(3);
      expect(stats.succeeded).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.deadLettered).toBe(1);
    });

    it('returns a snapshot (not a live reference)', () => {
      service.normalizeEvent(makePassthroughRaw());
      const snapshot1 = service.getStats();

      service.normalizeEvent(makePassthroughRaw());
      const snapshot2 = service.getStats();

      expect(snapshot1.processed).toBe(1);
      expect(snapshot2.processed).toBe(2);
    });
  });

  describe('createDefaultRegistry', () => {
    it('includes all built-in adapters', () => {
      const registry = NormalizationService.createDefaultRegistry();
      expect(registry.get('tracereplay')).toBeDefined();
      expect(registry.get('openai-agents')).toBeDefined();
      expect(registry.get('github-copilot')).toBeDefined();
      expect(registry.get('claude-code')).toBeDefined();
    });
  });

  describe('getRegistry', () => {
    it('returns the underlying adapter registry', () => {
      const registry = service.getRegistry();
      expect(registry.vendorIds()).toContain('tracereplay');
      expect(registry.vendorIds()).toContain('openai-agents');
      expect(registry.vendorIds()).toContain('github-copilot');
      expect(registry.vendorIds()).toContain('claude-code');
    });
  });
});
