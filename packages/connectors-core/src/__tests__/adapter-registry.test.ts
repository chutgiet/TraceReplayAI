import { describe, it, expect } from 'vitest';
import { AdapterRegistry, PassthroughAdapter, OpenAIAgentsAdapter } from '../index.js';
import type { NormalizerAdapter, RawVendorEvent } from '../types.js';

describe('AdapterRegistry', () => {
  const passthroughAdapter = new PassthroughAdapter();
  const openaiAdapter = new OpenAIAgentsAdapter();

  function makeRegistry(): AdapterRegistry {
    const registry = new AdapterRegistry();
    registry.register(passthroughAdapter);
    registry.register(openaiAdapter);
    return registry;
  }

  describe('register / get', () => {
    it('registers and retrieves adapters by vendorId', () => {
      const registry = makeRegistry();
      expect(registry.get('tracereplay')).toBe(passthroughAdapter);
      expect(registry.get('openai-agents')).toBe(openaiAdapter);
    });

    it('returns undefined for unknown vendor', () => {
      const registry = makeRegistry();
      expect(registry.get('langchain')).toBeUndefined();
    });

    it('overwrites existing adapter on re-register', () => {
      const registry = new AdapterRegistry();
      registry.register(passthroughAdapter);

      // Create a custom adapter with the same vendorId
      const custom: NormalizerAdapter = {
        vendorId: 'tracereplay',
        displayName: 'Custom passthrough',
        canHandle: () => false,
        normalize: () => ({ status: 'error', reason: 'custom', rawEvent: {} as RawVendorEvent }),
      };
      registry.register(custom);

      expect(registry.get('tracereplay')).toBe(custom);
    });
  });

  describe('resolve', () => {
    it('finds adapter by exact vendor match', () => {
      const registry = makeRegistry();
      const raw: RawVendorEvent = {
        vendor: 'openai-agents',
        tenantId: 'tenant-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { type: 'agent.start' },
      };
      expect(registry.resolve(raw)).toBe(openaiAdapter);
    });

    it('falls back to canHandle probing when vendor does not match', () => {
      const registry = makeRegistry();
      const raw: RawVendorEvent = {
        vendor: 'unknown-vendor',
        tenantId: 'tenant-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: {
          type: 'agent.start',
          trace_id: 'trace-001',
        },
      };
      // OpenAI adapter should pick this up via canHandle
      const resolved = registry.resolve(raw);
      expect(resolved).toBe(openaiAdapter);
    });

    it('returns undefined when no adapter matches', () => {
      const registry = makeRegistry();
      const raw: RawVendorEvent = {
        vendor: 'completely-unknown',
        tenantId: 'tenant-001',
        receivedAt: '2026-03-15T10:00:00.000Z',
        data: { someField: 'value' },
      };
      expect(registry.resolve(raw)).toBeUndefined();
    });
  });

  describe('vendorIds', () => {
    it('lists all registered vendor IDs', () => {
      const registry = makeRegistry();
      expect(registry.vendorIds()).toEqual(
        expect.arrayContaining(['tracereplay', 'openai-agents']),
      );
    });

    it('returns empty array for empty registry', () => {
      const registry = new AdapterRegistry();
      expect(registry.vendorIds()).toEqual([]);
    });
  });
});
