// Types
export type {
  NodeId,
  EdgeId,
  LineageNodeType,
  LineageEdgeType,
  RunNodeMeta,
  EventNodeMeta,
  SideEffectNodeMeta,
  ExternalSystemNodeMeta,
  NodeMetaMap,
  LineageNode,
  RunNode,
  EventNode,
  SideEffectNode,
  ExternalSystemNode,
  CausalEdgeMeta,
  TemporalEdgeMeta,
  ProducesEdgeMeta,
  DelegationEdgeMeta,
  DataFlowEdgeMeta,
  EdgeMetaMap,
  LineageEdge,
  CausalEdge,
  TemporalEdge,
  ProducesEdge,
  DelegationEdge,
  DataFlowEdge,
  LineageGraphSummary,
  IntegrityIssueType,
  IntegrityIssue,
  LineageGraph,
  BuildGraphOptions,
} from './types.js';

// Constants
export {
  NODE_TYPES,
  EDGE_TYPES,
  INTEGRITY_ISSUE_TYPES,
  SIDE_EFFECT_EVENT_TYPES,
  DATA_FLOW_PAIRS,
} from './constants.js';

// Graph builder
export { buildLineageGraph, resetEdgeCounter } from './graph-builder.js';

// Graph queries
export {
  getNode,
  getNodesByType,
  getEventNodesByEventType,
  getOutgoingEdges,
  getIncomingEdges,
  getEdgesByType,
  getAncestors,
  getDescendants,
  getCausalChain,
  getSideEffects,
  getSideEffectsByRun,
  getSideEffectsBySystem,
  getImpact,
  extractSubgraph,
  getCriticalPath,
  validateGraphIntegrity,
} from './graph-queries.js';

// Validators
export {
  nodeIdSchema,
  edgeIdSchema,
  lineageNodeTypeSchema,
  lineageEdgeTypeSchema,
  runNodeMetaSchema,
  eventNodeMetaSchema,
  sideEffectNodeMetaSchema,
  externalSystemNodeMetaSchema,
  lineageNodeSchema,
  causalEdgeMetaSchema,
  temporalEdgeMetaSchema,
  producesEdgeMetaSchema,
  delegationEdgeMetaSchema,
  dataFlowEdgeMetaSchema,
  lineageEdgeSchema,
  lineageGraphSummarySchema,
  integrityIssueTypeSchema,
  integrityIssueSchema,
  serializedLineageGraphSchema,
  validateSerializedGraph,
  validateNode,
  validateEdge,
} from './validators.js';
export type { SerializedLineageGraph } from './validators.js';

// Serialization
export { serializeGraph, deserializeGraph } from './serialization.js';
