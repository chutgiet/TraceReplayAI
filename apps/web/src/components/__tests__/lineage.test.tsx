import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RunEvent } from '@/lib/api';
import type { LineageNodeData } from '@/components/lineage/types';
import { getNodeTypeVisual, getEventNodeVisual, getEdgeTypeVisual, getAllNodeVisuals, getAllEdgeVisuals } from '@/components/lineage/node-type-config';
import { GraphLegend } from '@/components/lineage/graph-legend';
import { NodeDetailPanel } from '@/components/lineage/node-detail-panel';
import { GraphSummaryBar } from '@/components/lineage/graph-summary-bar';
import { DEFAULT_EDGE_VISIBILITY } from '@/components/lineage/use-lineage-graph';
import type { LineageGraph, LineageGraphSummary } from '@tracereplay/graph-model';

// ---------------------------------------------------------------------------
// node-type-config tests
// ---------------------------------------------------------------------------

describe('node-type-config', () => {
  describe('getNodeTypeVisual', () => {
    it('returns correct visual for run nodes', () => {
      const visual = getNodeTypeVisual('run');
      expect(visual.label).toBe('Run');
      expect(visual.icon).toBe('▶');
      expect(visual.bgColor).toContain('slate');
    });

    it('returns correct visual for event nodes', () => {
      const visual = getNodeTypeVisual('event');
      expect(visual.label).toBe('Event');
      expect(visual.bgColor).toContain('blue');
    });

    it('returns correct visual for side_effect nodes', () => {
      const visual = getNodeTypeVisual('side_effect');
      expect(visual.label).toBe('Side Effect');
      expect(visual.icon).toBe('⚡');
      expect(visual.bgColor).toContain('amber');
    });

    it('returns correct visual for external_system nodes', () => {
      const visual = getNodeTypeVisual('external_system');
      expect(visual.label).toBe('External System');
      expect(visual.bgColor).toContain('violet');
    });
  });

  describe('getEventNodeVisual', () => {
    it('returns correct visual for prompt.input', () => {
      const visual = getEventNodeVisual('prompt.input');
      expect(visual.icon).toBe('→');
      expect(visual.bgColor).toContain('blue');
    });

    it('returns correct visual for tool.call.start', () => {
      const visual = getEventNodeVisual('tool.call.start');
      expect(visual.icon).toBe('⚙');
      expect(visual.bgColor).toContain('green');
    });

    it('returns correct visual for run.error', () => {
      const visual = getEventNodeVisual('run.error');
      expect(visual.icon).toBe('✕');
      expect(visual.bgColor).toContain('red');
    });

    it('returns correct visual for side_effect.executed', () => {
      const visual = getEventNodeVisual('side_effect.executed');
      expect(visual.icon).toBe('⚡');
      expect(visual.bgColor).toContain('amber');
    });

    it('returns default visual for unknown event type', () => {
      const visual = getEventNodeVisual('unknown.type');
      expect(visual.icon).toBe('•');
      expect(visual.bgColor).toContain('gray');
    });

    it('provides visuals for all canonical event types', () => {
      const canonicalTypes = [
        'run.start', 'run.end', 'run.error',
        'prompt.input', 'prompt.output',
        'context.retrieved', 'context.injected',
        'tool.call.start', 'tool.call.end', 'tool.call.error',
        'approval.requested', 'approval.granted', 'approval.denied',
        'side_effect.executed', 'side_effect.failed',
        'model.request', 'model.response',
        'policy.evaluated', 'policy.violated',
      ];
      for (const type of canonicalTypes) {
        const visual = getEventNodeVisual(type);
        expect(visual.icon).toBeTruthy();
        expect(visual.bgColor).toBeTruthy();
      }
    });
  });

  describe('getEdgeTypeVisual', () => {
    it('returns solid style for causal edges', () => {
      const visual = getEdgeTypeVisual('causal');
      expect(visual.label).toBe('Caused by');
      expect(visual.strokeDasharray).toBeUndefined();
    });

    it('returns dashed style for temporal edges', () => {
      const visual = getEdgeTypeVisual('temporal');
      expect(visual.label).toBe('Followed by');
      expect(visual.strokeDasharray).toBeDefined();
    });

    it('returns animated style for delegation edges', () => {
      const visual = getEdgeTypeVisual('delegation');
      expect(visual.label).toBe('Delegated to');
      expect(visual.animated).toBe(true);
    });

    it('returns dashed style for data_flow edges', () => {
      const visual = getEdgeTypeVisual('data_flow');
      expect(visual.label).toBe('Data flow');
      expect(visual.strokeDasharray).toBeDefined();
    });
  });

  describe('getAllNodeVisuals / getAllEdgeVisuals', () => {
    it('returns all 4 node types', () => {
      const visuals = getAllNodeVisuals();
      expect(Object.keys(visuals)).toHaveLength(4);
      expect(visuals).toHaveProperty('run');
      expect(visuals).toHaveProperty('event');
      expect(visuals).toHaveProperty('side_effect');
      expect(visuals).toHaveProperty('external_system');
    });

    it('returns all 5 edge types', () => {
      const visuals = getAllEdgeVisuals();
      expect(Object.keys(visuals)).toHaveLength(5);
      expect(visuals).toHaveProperty('causal');
      expect(visuals).toHaveProperty('temporal');
      expect(visuals).toHaveProperty('produces');
      expect(visuals).toHaveProperty('delegation');
      expect(visuals).toHaveProperty('data_flow');
    });
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_EDGE_VISIBILITY tests
// ---------------------------------------------------------------------------

describe('DEFAULT_EDGE_VISIBILITY', () => {
  it('hides temporal edges by default', () => {
    expect(DEFAULT_EDGE_VISIBILITY.temporal).toBe(false);
  });

  it('shows causal edges by default', () => {
    expect(DEFAULT_EDGE_VISIBILITY.causal).toBe(true);
  });

  it('shows produces edges by default', () => {
    expect(DEFAULT_EDGE_VISIBILITY.produces).toBe(true);
  });

  it('shows delegation edges by default', () => {
    expect(DEFAULT_EDGE_VISIBILITY.delegation).toBe(true);
  });

  it('shows data_flow edges by default', () => {
    expect(DEFAULT_EDGE_VISIBILITY.data_flow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GraphLegend tests
// ---------------------------------------------------------------------------

describe('GraphLegend', () => {
  const defaultProps = {
    edgeVisibility: { ...DEFAULT_EDGE_VISIBILITY },
    onEdgeVisibilityChange: vi.fn(),
  };

  it('renders node type labels', () => {
    render(<GraphLegend {...defaultProps} />);

    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('Side Effect')).toBeInTheDocument();
    expect(screen.getByText('External System')).toBeInTheDocument();
  });

  it('renders edge type labels', () => {
    render(<GraphLegend {...defaultProps} />);

    expect(screen.getByText('Caused by')).toBeInTheDocument();
    expect(screen.getByText('Followed by')).toBeInTheDocument();
    expect(screen.getByText('Produces')).toBeInTheDocument();
    expect(screen.getByText('Delegated to')).toBeInTheDocument();
    expect(screen.getByText('Data flow')).toBeInTheDocument();
  });

  it('renders edge checkboxes matching visibility state', () => {
    render(<GraphLegend {...defaultProps} />);

    const causalCheckbox = screen.getByLabelText('Toggle Caused by edges');
    const temporalCheckbox = screen.getByLabelText('Toggle Followed by edges');

    expect(causalCheckbox).toBeChecked();
    expect(temporalCheckbox).not.toBeChecked();
  });

  it('calls onEdgeVisibilityChange when checkbox is toggled', () => {
    const onChange = vi.fn();
    render(
      <GraphLegend
        edgeVisibility={DEFAULT_EDGE_VISIBILITY}
        onEdgeVisibilityChange={onChange}
      />,
    );

    const temporalCheckbox = screen.getByLabelText('Toggle Followed by edges');
    fireEvent.click(temporalCheckbox);

    expect(onChange).toHaveBeenCalledWith('temporal', true);
  });

  it('has proper ARIA label', () => {
    render(<GraphLegend {...defaultProps} />);
    expect(screen.getByRole('region', { name: 'Graph legend' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// NodeDetailPanel tests
// ---------------------------------------------------------------------------

describe('NodeDetailPanel', () => {
  const baseData: LineageNodeData = {
    nodeType: 'event',
    label: 'Prompt Input',
    eventType: 'prompt.input',
    sourceEventId: 'evt-12345',
    runId: 'run-67890',
    meta: {
      eventType: 'prompt.input',
      sourceAgent: 'test-agent',
      sourceFramework: 'openai',
      timestamp: '2026-03-22T10:00:00.000Z',
      sequence: 1,
    },
  };

  it('renders node label and type', () => {
    render(<NodeDetailPanel data={baseData} onClose={vi.fn()} />);

    expect(screen.getByText('Prompt Input')).toBeInTheDocument();
    expect(screen.getByText('event · prompt.input')).toBeInTheDocument();
  });

  it('renders event ID', () => {
    render(<NodeDetailPanel data={baseData} onClose={vi.fn()} />);

    expect(screen.getByText('evt-12345')).toBeInTheDocument();
  });

  it('renders run ID', () => {
    render(<NodeDetailPanel data={baseData} onClose={vi.fn()} />);

    expect(screen.getByText('run-67890')).toBeInTheDocument();
  });

  it('renders event-specific fields', () => {
    render(<NodeDetailPanel data={baseData} onClose={vi.fn()} />);

    expect(screen.getByText('test-agent')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<NodeDetailPanel data={baseData} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close node detail'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders run node fields correctly', () => {
    const runData: LineageNodeData = {
      nodeType: 'run',
      label: 'My Run',
      runId: 'run-123',
      meta: {
        agentId: 'agent-x',
        status: 'success',
        triggerSource: 'api',
        durationMs: 5000,
      },
    };
    render(<NodeDetailPanel data={runData} onClose={vi.fn()} />);

    expect(screen.getByText('agent-x')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByText('5.0s')).toBeInTheDocument();
  });

  it('renders side_effect node fields correctly', () => {
    const seData: LineageNodeData = {
      nodeType: 'side_effect',
      label: 'Created file',
      sourceEventId: 'evt-se-1',
      runId: 'run-123',
      meta: {
        effectType: 'file_create',
        targetSystem: 'filesystem',
        description: 'Created output.txt',
        reversible: true,
        success: true,
      },
    };
    render(<NodeDetailPanel data={seData} onClose={vi.fn()} />);

    expect(screen.getByText('file_create')).toBeInTheDocument();
    expect(screen.getByText('filesystem')).toBeInTheDocument();
    expect(screen.getByText('Created output.txt')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument(); // reversible
  });

  it('renders external_system node fields correctly', () => {
    const esData: LineageNodeData = {
      nodeType: 'external_system',
      label: '☁ GitHub',
      meta: {
        systemName: 'GitHub',
        effectCount: 3,
      },
    };
    render(<NodeDetailPanel data={esData} onClose={vi.fn()} />);

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('has proper ARIA label', () => {
    render(<NodeDetailPanel data={baseData} onClose={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Node detail' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GraphSummaryBar tests
// ---------------------------------------------------------------------------

describe('GraphSummaryBar', () => {
  function makeMockGraph(overrides?: Partial<LineageGraphSummary>): LineageGraph {
    const summary: LineageGraphSummary = {
      nodeCount: 10,
      edgeCount: 15,
      nodeTypeCounts: { run: 1, event: 6, side_effect: 2, external_system: 1 },
      edgeTypeCounts: { causal: 3, temporal: 5, produces: 3, delegation: 0, data_flow: 4 },
      runCount: 1,
      externalSystemCount: 1,
      sideEffectCount: 2,
      maxCausalDepth: 3,
      hasDelegation: false,
      ...overrides,
    };
    return {
      nodes: new Map(),
      edges: new Map(),
      adjacency: new Map(),
      reverseAdjacency: new Map(),
      summary,
    };
  }

  it('renders all summary stats', () => {
    const graph = makeMockGraph();
    render(<GraphSummaryBar graph={graph} />);

    expect(screen.getByText('10')).toBeInTheDocument(); // nodes
    expect(screen.getByText('15')).toBeInTheDocument(); // edges
    expect(screen.getByText('6')).toBeInTheDocument();  // events
    expect(screen.getByText('2')).toBeInTheDocument();  // side effects
    expect(screen.getByText('1')).toBeInTheDocument();  // external systems
    expect(screen.getByText('3')).toBeInTheDocument();  // max causal depth
  });

  it('shows delegation badge when hasDelegation is true', () => {
    const graph = makeMockGraph({ hasDelegation: true });
    render(<GraphSummaryBar graph={graph} />);

    expect(screen.getByText('Sub-agent delegation')).toBeInTheDocument();
  });

  it('does not show delegation badge when hasDelegation is false', () => {
    const graph = makeMockGraph({ hasDelegation: false });
    render(<GraphSummaryBar graph={graph} />);

    expect(screen.queryByText('Sub-agent delegation')).not.toBeInTheDocument();
  });

  it('has proper ARIA label', () => {
    const graph = makeMockGraph();
    render(<GraphSummaryBar graph={graph} />);
    expect(screen.getByRole('region', { name: 'Graph summary' })).toBeInTheDocument();
  });
});
