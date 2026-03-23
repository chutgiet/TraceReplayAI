'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeClick,
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
}

// ---------------------------------------------------------------------------
// Inner component (needs ReactFlowProvider context)
// ---------------------------------------------------------------------------

function LineageGraphViewInner({ events }: LineageGraphViewProps) {
  const [edgeVisibility, setEdgeVisibility] = useState<EdgeVisibility>(
    DEFAULT_EDGE_VISIBILITY,
  );
  const [selectedNodeData, setSelectedNodeData] =
    useState<LineageNodeData | null>(null);

  const { nodes, edges, graph, isEmpty } = useLineageGraph(
    events,
    edgeVisibility,
  );

  const handleEdgeVisibilityChange = useCallback(
    (edgeType: string, visible: boolean) => {
      setEdgeVisibility((prev) => ({ ...prev, [edgeType]: visible }));
    },
    [],
  );

  const handleNodeClick: OnNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const data = node.data as LineageNodeData;
      setSelectedNodeData(data);
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeData(null);
  }, []);

  if (isEmpty) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-[var(--color-border)]">
        <div className="text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            No lineage data available for this run.
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Events may not have enough causal relationships to build a graph.
          </p>
        </div>
      </div>
    );
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
