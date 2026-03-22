import { z } from 'zod';
import { NODE_TYPES, EDGE_TYPES, INTEGRITY_ISSUE_TYPES } from './constants.js';

// ---------------------------------------------------------------------------
// Branded ID schemas
// ---------------------------------------------------------------------------

export const nodeIdSchema = z.string().min(1).brand<'NodeId'>();
export const edgeIdSchema = z.string().min(1).brand<'EdgeId'>();

// ---------------------------------------------------------------------------
// Node type & edge type schemas
// ---------------------------------------------------------------------------

export const lineageNodeTypeSchema = z.enum([
  NODE_TYPES[0]!,
  ...NODE_TYPES.slice(1),
]);

export const lineageEdgeTypeSchema = z.enum([
  EDGE_TYPES[0]!,
  ...EDGE_TYPES.slice(1),
]);

// ---------------------------------------------------------------------------
// Node metadata schemas
// ---------------------------------------------------------------------------

export const runNodeMetaSchema = z.object({
  agentId: z.string(),
  runName: z.string().optional(),
  triggerSource: z.string().optional(),
  status: z.enum(['success', 'failure', 'timeout', 'cancelled', 'running']).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  parentRunId: z.string().optional(),
});

export const eventNodeMetaSchema = z.object({
  eventType: z.string(),
  sourceAgent: z.string(),
  sourceFramework: z.string().optional(),
  timestamp: z.string(),
  sequence: z.number().optional(),
  label: z.string().optional(),
});

export const sideEffectNodeMetaSchema = z.object({
  effectType: z.string(),
  targetSystem: z.string(),
  description: z.string(),
  reversible: z.boolean(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

export const externalSystemNodeMetaSchema = z.object({
  systemName: z.string(),
  effectCount: z.number().nonnegative(),
});

// ---------------------------------------------------------------------------
// Lineage node schema
// ---------------------------------------------------------------------------

export const lineageNodeSchema = z.object({
  id: z.string().min(1),
  type: lineageNodeTypeSchema,
  runId: z.string().optional(),
  tenantId: z.string(),
  meta: z.record(z.unknown()),
  sourceEventId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Edge metadata schemas
// ---------------------------------------------------------------------------

export const causalEdgeMetaSchema = z.object({
  parentEventId: z.string(),
});

export const temporalEdgeMetaSchema = z.object({
  gapMs: z.number(),
});

export const producesEdgeMetaSchema = z.object({
  effectType: z.string(),
  targetSystem: z.string(),
});

export const delegationEdgeMetaSchema = z.object({
  parentRunId: z.string(),
  childRunId: z.string(),
});

export const dataFlowEdgeMetaSchema = z.object({
  description: z.string(),
});

// ---------------------------------------------------------------------------
// Lineage edge schema
// ---------------------------------------------------------------------------

export const lineageEdgeSchema = z.object({
  id: z.string().min(1),
  type: lineageEdgeTypeSchema,
  source: z.string().min(1),
  target: z.string().min(1),
  meta: z.record(z.unknown()),
});

// ---------------------------------------------------------------------------
// Graph summary schema
// ---------------------------------------------------------------------------

export const lineageGraphSummarySchema = z.object({
  nodeCount: z.number().nonnegative(),
  edgeCount: z.number().nonnegative(),
  nodeTypeCounts: z.object({
    run: z.number().nonnegative(),
    event: z.number().nonnegative(),
    side_effect: z.number().nonnegative(),
    external_system: z.number().nonnegative(),
  }),
  edgeTypeCounts: z.object({
    causal: z.number().nonnegative(),
    temporal: z.number().nonnegative(),
    produces: z.number().nonnegative(),
    delegation: z.number().nonnegative(),
    data_flow: z.number().nonnegative(),
  }),
  runCount: z.number().nonnegative(),
  externalSystemCount: z.number().nonnegative(),
  sideEffectCount: z.number().nonnegative(),
  maxCausalDepth: z.number().nonnegative(),
  hasDelegation: z.boolean(),
});

// ---------------------------------------------------------------------------
// Integrity issue schema
// ---------------------------------------------------------------------------

export const integrityIssueTypeSchema = z.enum([
  INTEGRITY_ISSUE_TYPES[0]!,
  ...INTEGRITY_ISSUE_TYPES.slice(1),
]);

export const integrityIssueSchema = z.object({
  type: integrityIssueTypeSchema,
  message: z.string(),
  relatedNodeIds: z.array(z.string()),
  relatedEdgeIds: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Serializable graph schema (for API/persistence boundaries)
// ---------------------------------------------------------------------------

/** Schema for a serialized lineage graph (with nodes/edges as arrays). */
export const serializedLineageGraphSchema = z.object({
  nodes: z.array(lineageNodeSchema),
  edges: z.array(lineageEdgeSchema),
  summary: lineageGraphSummarySchema,
});

export type SerializedLineageGraph = z.infer<typeof serializedLineageGraphSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Validate a serialized lineage graph. */
export function validateSerializedGraph(input: unknown): {
  success: true; data: SerializedLineageGraph;
} | {
  success: false; error: z.ZodError;
} {
  const result = serializedLineageGraphSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/** Validate a single lineage node. */
export function validateNode(input: unknown): {
  success: true; data: z.infer<typeof lineageNodeSchema>;
} | {
  success: false; error: z.ZodError;
} {
  const result = lineageNodeSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/** Validate a single lineage edge. */
export function validateEdge(input: unknown): {
  success: true; data: z.infer<typeof lineageEdgeSchema>;
} | {
  success: false; error: z.ZodError;
} {
  const result = lineageEdgeSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
