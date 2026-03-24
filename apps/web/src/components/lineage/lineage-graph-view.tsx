'use client';

import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { RunEvent } from '@/lib/api';
import type { LineageNodeData } from './types';
import { LineageNodeComponent_Memo } from './lineage-node';
import { LineageEdgeComponent_Memo } from './lineage-edge';
import { GraphControls } from './graph-controls';
import { GraphLegend } from './graph-legend';
import { GraphSummaryBar } from './graph-summary-bar';
import { NodeDetailPanel } from './node-detail-panel';
import { LineageEmptyState } from '@/components/states';
import {
  useLineageGraph,
  DEFAULT_EDGE_VISIBILITY,
  type EdgeVisibility,
} from './use-lineage-graph';

// ---------------------------------------------------------------------------
// Node / edge type registrations
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  lineageNode: LineageNodeComponent_Memo as unknown as NodeTypes['lineageNode'],
};

const edgeTypes: EdgeTypes = {
  lineageEdge: LineageEdgeComponent_Memo as unknown as EdgeTypes['lineageEdge'],
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LineageGraphViewProps {
  events: RunEvent[];
  /** Events from related runs (e.g. child sub-agent runs) for cross-run edges. */
  relatedRunEvents?: RunEvent[];
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

function LineageGraphViewInner({ events, relatedRunEvents }: LineageGraphViewProps) {
  const [edgeVisibility, setEdgeVisibility] = useState<EdgeVisibility>(
    DEFAULT_EDGE_VISIBILITY,
  );
  const [selectedNodeData, setSelectedNodeData] =
    useState<LineageNodeData | null>(null);

  const { nodes, edges, graph, isEmpty } = useLineageGraph(
    events,
    edgeVisibility,
    relatedRunEvents ?? [],
  );

  const handleEdgeVisibilityChange = useCallback(
    (edgeType: string, visible: boolean) => {
      setEdgeVisibility((prev) => ({ ...prev, [edgeType]: visible }));
    },
    [],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeData(node.data as unknown as LineageNodeData);
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
  }, []);

  if (isEmpty) {
    return <LineageEmptyState />;
  }

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      {graph && <GraphSummaryBar graph={graph} />}

      {/* Graph canvas */}
      <div className="relative h-[600px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.15, duration: 300 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'lineageEdge',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="!bg-[var(--color-surface)]"
          />
          <GraphControls className="absolute right-3 top-3 z-10" />
        </ReactFlow>

        {/* Legend overlay */}
        <GraphLegend
          edgeVisibility={edgeVisibility}
          onEdgeVisibilityChange={handleEdgeVisibilityChange}
          className="absolute bottom-3 left-3 z-10 max-h-80 overflow-y-auto"
        />

        {/* Node detail panel */}
        {selectedNodeData && (
          <NodeDetailPanel
            data={selectedNodeData}
            onClose={() => setSelectedNodeData(null)}
            className="absolute right-3 bottom-3 z-10 w-72 max-h-80"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component (wraps with ReactFlowProvider)
// ---------------------------------------------------------------------------

/**
 * Main lineage graph visualization component.
 * Renders an interactive node-edge diagram from run events.
 */
export function LineageGraphView(props: LineageGraphViewProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <LineageGraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
