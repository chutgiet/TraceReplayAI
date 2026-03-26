import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const createBundleBodySchema = z.object({
  runId: z.string().uuid('runId must be a valid UUID'),
  tenantId: z.string().min(1, 'tenantId is required'),
});

export const bundleIdParamSchema = z.object({
  bundleId: z.string().uuid('bundleId must be a valid UUID'),
});

export const bundlesByRunQuerySchema = z.object({
  runId: z.string().uuid('runId must be a valid UUID'),
  tenantId: z.string().min(1).optional(),
});

export const listBundlesQuerySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateBundleBody = z.infer<typeof createBundleBodySchema>;
export type BundleIdParam = z.infer<typeof bundleIdParamSchema>;
export type BundlesByRunQuery = z.infer<typeof bundlesByRunQuerySchema>;
export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;
