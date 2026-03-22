import type { LineageNodeType, LineageEdgeType, IntegrityIssueType } from './types.js';

/** All valid lineage node types. */
export const NODE_TYPES: readonly LineageNodeType[] = [
  'run',
  'event',
  'side_effect',
  'external_system',
] as const;

/** All valid lineage edge types. */
export const EDGE_TYPES: readonly LineageEdgeType[] = [
  'causal',
  'temporal',
  'produces',
  'delegation',
  'data_flow',
] as const;

/** All valid integrity issue types. */
export const INTEGRITY_ISSUE_TYPES: readonly IntegrityIssueType[] = [
  'dangling_edge_source',
  'dangling_edge_target',
  'self_loop',
  'duplicate_edge',
  'orphan_node',
  'missing_run_node',
  'cycle_detected',
] as const;

/**
 * Event types that produce side effects.
 * Used to detect which events generate side-effect nodes.
 */
export const SIDE_EFFECT_EVENT_TYPES = [
  'side_effect.executed',
  'side_effect.failed',
] as const;

/**
 * Event type pairs that imply data_flow edges.
 * Each entry: [sourceType, targetType, description].
 */
export const DATA_FLOW_PAIRS: readonly [string, string, string][] = [
  ['context.retrieved', 'context.injected', 'Retrieved context injected into prompt'],
  ['context.injected', 'prompt.input', 'Context injected as prompt input'],
  ['prompt.input', 'model.request', 'Prompt sent to model'],
  ['model.response', 'prompt.output', 'Model response received as output'],
  ['prompt.output', 'tool.call.start', 'Model output triggers tool call'],
  ['model.response', 'tool.call.start', 'Model response triggers tool call'],
  ['tool.call.end', 'prompt.input', 'Tool output fed back as prompt'],
] as const;
