import { describe, it, expect } from 'vitest';
import {
  createBundleBodySchema,
  bundleIdParamSchema,
  bundlesByRunQuerySchema,
  listBundlesQuerySchema,
} from '../validators.js';

describe('createBundleBodySchema', () => {
  it('accepts valid input', () => {
    const result = createBundleBodySchema.safeParse({
      runId: 'b0000001-0000-4000-8000-000000000001',
      tenantId: 'tenant-001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing runId', () => {
    const result = createBundleBodySchema.safeParse({ tenantId: 'tenant-001' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for runId', () => {
    const result = createBundleBodySchema.safeParse({
      runId: 'not-a-uuid',
      tenantId: 'tenant-001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty tenantId', () => {
    const result = createBundleBodySchema.safeParse({
      runId: 'b0000001-0000-4000-8000-000000000001',
      tenantId: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing tenantId', () => {
    const result = createBundleBodySchema.safeParse({
      runId: 'b0000001-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(false);
  });
});

describe('bundleIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = bundleIdParamSchema.safeParse({
      bundleId: 'c0000001-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID', () => {
    const result = bundleIdParamSchema.safeParse({
      bundleId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('bundlesByRunQuerySchema', () => {
  it('accepts valid run query', () => {
    const result = bundlesByRunQuerySchema.safeParse({
      runId: 'b0000001-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional tenantId', () => {
    const result = bundlesByRunQuerySchema.safeParse({
      runId: 'b0000001-0000-4000-8000-000000000001',
      tenantId: 'tenant-001',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenantId).toBe('tenant-001');
    }
  });
});

describe('listBundlesQuerySchema', () => {
  it('accepts valid tenant query', () => {
    const result = listBundlesQuerySchema.safeParse({
      tenantId: 'tenant-001',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional limit', () => {
    const result = listBundlesQuerySchema.safeParse({
      tenantId: 'tenant-001',
      limit: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('coerces string limit to number', () => {
    const result = listBundlesQuerySchema.safeParse({
      tenantId: 'tenant-001',
      limit: '25',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('rejects limit above 100', () => {
    const result = listBundlesQuerySchema.safeParse({
      tenantId: 'tenant-001',
      limit: 200,
    });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = listBundlesQuerySchema.safeParse({
      tenantId: 'tenant-001',
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing tenantId', () => {
    const result = listBundlesQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
