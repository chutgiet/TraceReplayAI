import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import type { EventRow, RunRow } from '@tracereplay/common';
import type { BundleRow } from '../types.js';
import { BUNDLE_SCHEMA_VERSION } from '../types.js';
import { EvidenceBundleAssembler, AssemblyError } from '../assembler.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-test-001';
const RUN_ID = 'b0000001-0000-4000-8000-000000000001';

function makeRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: RUN_ID,
    tenant_id: TENANT_ID,
    agent_id: 'test-agent',
    run_name: 'test-run',
    trigger_source: 'user',
    parent_run_id: null,
    status: 'success',
    started_at: new Date('2026-03-15T10:00:00.000Z'),
    ended_at: new Date('2026-03-15T10:00:05.000Z'),
    tags: ['test'],
    metadata: null,
    schema_version: '1.0.0',
    created_at: new Date('2026-03-15T10:00:00.000Z'),
    updated_at: new Date('2026-03-15T10:00:05.000Z'),
    ...overrides,
  };
}

function makeEventRow(index: number, type: string, payload: Record<string, unknown>, overrides: Partial<EventRow> = {}): EventRow {
  const id = `a0000001-0000-4000-8000-00000000000${index}`;
  return {
    id,
    run_id: RUN_ID,
    tenant_id: TENANT_ID,
    type,
    sequence: index,
    parent_event_id: null,
    source_agent: 'test-agent',
    source_framework: 'custom',
    payload,
    raw_meta: null,
    tags: ['test'],
    schema_version: '1.0.0',
    timestamp: new Date(`2026-03-15T10:00:0${index}.000Z`),
    received_at: new Date(`2026-03-15T10:00:0${index}.100Z`),
    ingestion_order: index,
    ...overrides,
  };
}

function makeSimpleChatEvents(): EventRow[] {
  return [
    makeEventRow(1, 'run.start', { runName: 'test-run', triggerSource: 'user' }),
    makeEventRow(2, 'prompt.input', { role: 'user', content: 'Hello', tokenCount: 1 }),
    makeEventRow(3, 'model.request', { modelProvider: 'openai', modelId: 'gpt-4', inputTokens: 10, temperature: 0.3 }),
    makeEventRow(4, 'model.response', { modelProvider: 'openai', modelId: 'gpt-4', outputTokens: 20, latencyMs: 150 }),
    makeEventRow(5, 'prompt.output', { content: 'Hello! How can I help?', tokenCount: 6, finishReason: 'stop' }),
    makeEventRow(6, 'run.end', { status: 'success', durationMs: 5000 }),
  ];
}

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

function createMockPool(runRow: RunRow | null, eventRows: EventRow[], childRuns: RunRow[] = []): Pool {
  const mockPool = {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      const sqlNorm = sql.replace(/\s+/g, ' ').trim();

      // getRunById
      if (sqlNorm.includes('SELECT * FROM runs WHERE id =')) {
        return Promise.resolve({ rows: runRow ? [runRow] : [], rowCount: runRow ? 1 : 0 });
      }

      // getEventsByRunId
      if (sqlNorm.includes('SELECT * FROM events WHERE run_id =')) {
        return Promise.resolve({ rows: eventRows, rowCount: eventRows.length });
      }

      // getChildRunsByParentId
      if (sqlNorm.includes('SELECT * FROM runs WHERE parent_run_id =')) {
        return Promise.resolve({ rows: childRuns, rowCount: childRuns.length });
      }

      // insertBundle
      if (sqlNorm.includes('INSERT INTO evidence_bundles')) {
        const id = (params as unknown[])?.[0] as string;
        const row: Partial<BundleRow> = {
          id,
          run_id: (params as unknown[])?.[1] as string,
          tenant_id: (params as unknown[])?.[2] as string,
          status: (params as unknown[])?.[3] as BundleRow['status'],
          is_partial_run: false,
          error_message: null,
          bundle_data: null,
          bundle_schema_version: BUNDLE_SCHEMA_VERSION,
          created_at: new Date(),
          completed_at: null,
        };
        return Promise.resolve({ rows: [row], rowCount: 1 });
      }

      // updateBundleStatus
      if (sqlNorm.includes('UPDATE evidence_bundles')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      // getBundleById
      if (sqlNorm.includes('SELECT * FROM evidence_bundles WHERE id =')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }

      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;

  return mockPool;
}

// ---------------------------------------------------------------------------
// Tests: EvidenceBundleAssembler
// ---------------------------------------------------------------------------

describe('EvidenceBundleAssembler', () => {
  it('assembles a complete bundle from a successful run', async () => {
    const run = makeRunRow();
    const events = makeSimpleChatEvents();
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    const bundle = result.bundle;

    // Bundle metadata
    expect(bundle.runId).toBe(RUN_ID);
    expect(bundle.tenantId).toBe(TENANT_ID);
    expect(bundle.status).toBe('complete');
    expect(bundle.bundleSchemaVersion).toBe(BUNDLE_SCHEMA_VERSION);
    expect(bundle.errorMessage).toBeNull();

    // Run metadata snapshot
    expect(bundle.runMetadata).not.toBeNull();
    expect(bundle.runMetadata!.runId).toBe(RUN_ID);
    expect(bundle.runMetadata!.agentId).toBe('test-agent');
    expect(bundle.runMetadata!.status).toBe('success');
    expect(bundle.runMetadata!.startedAt).toBe('2026-03-15T10:00:00.000Z');
    expect(bundle.runMetadata!.endedAt).toBe('2026-03-15T10:00:05.000Z');

    // Events
    expect(bundle.events).toHaveLength(6);
    expect(bundle.events[0]!.type).toBe('run.start');
    expect(bundle.events[5]!.type).toBe('run.end');

    // Timeline
    expect(bundle.timeline).not.toBeNull();
    expect(bundle.timeline!.entries).toHaveLength(6);
    expect(bundle.timeline!.summary.eventCount).toBe(6);
    expect(bundle.timeline!.summary.status).toBe('success');

    // Lineage graph
    expect(bundle.lineageGraph).not.toBeNull();
    expect(bundle.lineageGraph!.nodes.length).toBeGreaterThan(0);
    expect(bundle.lineageGraph!.edges.length).toBeGreaterThan(0);
    expect(bundle.lineageGraph!.summary.nodeCount).toBeGreaterThan(0);

    // Partial run markers
    expect(bundle.isPartialRun).toBe(false);
    expect(bundle.partialRunMarker).toBeNull();

    // Timestamps
    expect(bundle.createdAt).toBeTruthy();
    expect(bundle.completedAt).toBeTruthy();
  });

  it('marks partial runs with appropriate markers', async () => {
    const run = makeRunRow({ status: 'running', ended_at: null });
    const events = [
      makeEventRow(1, 'run.start', { runName: 'in-progress-run', triggerSource: 'user' }),
      makeEventRow(2, 'prompt.input', { role: 'user', content: 'Working...', tokenCount: 1 }),
    ];
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    expect(result.bundle.isPartialRun).toBe(true);
    expect(result.bundle.partialRunMarker).toContain('still in progress');
    expect(result.bundle.partialRunMarker).toContain(RUN_ID);
    expect(result.bundle.status).toBe('complete');
  });

  it('handles runs with zero events', async () => {
    const run = makeRunRow();
    const pool = createMockPool(run, []);

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    expect(result.bundle.events).toHaveLength(0);
    expect(result.bundle.timeline).toBeNull();
    expect(result.bundle.lineageGraph).toBeNull();
    expect(result.bundle.status).toBe('complete');
    expect(result.bundle.redactionAudit.totalRedactedFields).toBe(0);
  });

  it('throws AssemblyError for non-existent run', async () => {
    const pool = createMockPool(null, []);

    const assembler = new EvidenceBundleAssembler(pool);

    await expect(
      assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID }),
    ).rejects.toThrow(AssemblyError);

    await expect(
      assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID }),
    ).rejects.toThrow(/not found/);
  });

  it('throws AssemblyError for tenant mismatch', async () => {
    const run = makeRunRow({ tenant_id: 'other-tenant' });
    const pool = createMockPool(run, []);

    const assembler = new EvidenceBundleAssembler(pool);

    await expect(
      assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID }),
    ).rejects.toThrow(AssemblyError);

    try {
      await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });
    } catch (err) {
      expect(err).toBeInstanceOf(AssemblyError);
      expect((err as AssemblyError).code).toBe('TENANT_MISMATCH');
    }
  });

  it('includes child run events in lineage graph', async () => {
    const childRunId = 'c0000001-0000-4000-8000-000000000001';
    const run = makeRunRow();
    const events = makeSimpleChatEvents();
    const childRun = makeRunRow({
      id: childRunId,
      parent_run_id: RUN_ID,
      run_name: 'child-run',
    });
    const childEvents: EventRow[] = [
      makeEventRow(1, 'run.start', { runName: 'child-run', triggerSource: 'agent', parentRunId: RUN_ID }, {
        id: 'c0000001-0000-4000-8000-000000000011',
        run_id: childRunId,
      }),
      makeEventRow(2, 'run.end', { status: 'success', durationMs: 1000 }, {
        id: 'c0000001-0000-4000-8000-000000000012',
        run_id: childRunId,
      }),
    ];

    // Custom pool that returns child events for child run queries
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        const sqlNorm = sql.replace(/\s+/g, ' ').trim();

        if (sqlNorm.includes('SELECT * FROM runs WHERE id =')) {
          const id = (params as unknown[])?.[0];
          if (id === RUN_ID) return Promise.resolve({ rows: [run], rowCount: 1 });
          if (id === childRunId) return Promise.resolve({ rows: [childRun], rowCount: 1 });
          return Promise.resolve({ rows: [], rowCount: 0 });
        }

        if (sqlNorm.includes('SELECT * FROM events WHERE run_id =')) {
          const id = (params as unknown[])?.[0];
          if (id === RUN_ID) return Promise.resolve({ rows: events, rowCount: events.length });
          if (id === childRunId) return Promise.resolve({ rows: childEvents, rowCount: childEvents.length });
          return Promise.resolve({ rows: [], rowCount: 0 });
        }

        if (sqlNorm.includes('SELECT * FROM runs WHERE parent_run_id =')) {
          return Promise.resolve({ rows: [childRun], rowCount: 1 });
        }

        if (sqlNorm.includes('INSERT INTO evidence_bundles')) {
          const row = {
            id: (params as unknown[])?.[0],
            run_id: (params as unknown[])?.[1],
            tenant_id: (params as unknown[])?.[2],
            status: (params as unknown[])?.[3],
            is_partial_run: false,
            error_message: null,
            bundle_data: null,
            bundle_schema_version: BUNDLE_SCHEMA_VERSION,
            created_at: new Date(),
            completed_at: null,
          };
          return Promise.resolve({ rows: [row], rowCount: 1 });
        }

        if (sqlNorm.includes('UPDATE evidence_bundles')) {
          return Promise.resolve({ rows: [], rowCount: 1 });
        }

        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as unknown as Pool;

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    // Lineage graph should contain delegation edges from child runs
    expect(result.bundle.lineageGraph).not.toBeNull();
    const graph = result.bundle.lineageGraph!;
    expect(graph.summary.hasDelegation).toBe(true);
  });

  it('captures redaction audit for events with sensitive fields', async () => {
    const run = makeRunRow();
    const events = [
      makeEventRow(1, 'run.start', { runName: 'test', triggerSource: 'user' }),
      makeEventRow(2, 'prompt.input', {
        role: 'user',
        content: 'Use my API key: sk-1234567890abcdef',
        tokenCount: 10,
        apiKey: 'sk-secret-key-value',
      }),
      makeEventRow(3, 'run.end', { status: 'success', durationMs: 1000 }),
    ];
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    const audit = result.bundle.redactionAudit;
    // The apiKey field should be detected by built-in path rules
    expect(audit.totalRedactedFields).toBeGreaterThan(0);
    expect(audit.eventRedactions.length).toBeGreaterThan(0);

    // Find the event with apiKey
    const apiKeyRedaction = audit.eventRedactions.find(
      (e) => e.redactedFields.some((r) => r.fieldPath.includes('apiKey')),
    );
    expect(apiKeyRedaction).toBeDefined();
  });

  it('persists bundle status transitions correctly', async () => {
    const run = makeRunRow();
    const events = makeSimpleChatEvents();
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;

    // Verify status transitions: INSERT (pending) -> UPDATE (assembling) -> UPDATE (complete)
    const insertCall = queryCalls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO evidence_bundles'),
    );
    expect(insertCall).toBeDefined();
    expect((insertCall as unknown[])[1]).toContain('pending');

    const updateCalls = queryCalls.filter((c: unknown[]) =>
      (c[0] as string).includes('UPDATE evidence_bundles'),
    );
    expect(updateCalls.length).toBe(2); // assembling + complete
    expect((updateCalls[0] as unknown[])[1]).toContain('assembling');
    expect((updateCalls[1] as unknown[])[1]).toContain('complete');
  });

  it('persists failed status when assembly errors', async () => {
    const pool = createMockPool(null, []);

    const assembler = new EvidenceBundleAssembler(pool);

    try {
      await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });
    } catch {
      // expected
    }

    const queryCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;

    // Should have UPDATE to 'assembling' then UPDATE to 'failed'
    const updateCalls = queryCalls.filter((c: unknown[]) =>
      (c[0] as string).includes('UPDATE evidence_bundles'),
    );
    expect(updateCalls.length).toBe(2);
    expect((updateCalls[1] as unknown[])[1]).toContain('failed');
  });

  it('generates unique bundle IDs', async () => {
    const run = makeRunRow();
    const events = makeSimpleChatEvents();
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    const result1 = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });
    const result2 = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    expect(result1.bundle.id).not.toBe(result2.bundle.id);
  });

  it('includes timeline gaps for incomplete runs', async () => {
    const run = makeRunRow();
    // Events without run.start (partial telemetry)
    const events = [
      makeEventRow(2, 'prompt.input', { role: 'user', content: 'Hello', tokenCount: 1 }),
      makeEventRow(3, 'prompt.output', { content: 'Hi there', tokenCount: 2, finishReason: 'stop' }),
    ];
    const pool = createMockPool(run, events);

    const assembler = new EvidenceBundleAssembler(pool);
    const result = await assembler.assemble({ runId: RUN_ID, tenantId: TENANT_ID });

    expect(result.bundle.timeline).not.toBeNull();
    expect(result.bundle.timeline!.gaps.length).toBeGreaterThan(0);
    expect(result.bundle.timeline!.summary.hasGaps).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: AssemblyError
// ---------------------------------------------------------------------------

describe('AssemblyError', () => {
  it('has correct name, message, and code', () => {
    const err = new AssemblyError('Run not found', 'RUN_NOT_FOUND');
    expect(err.name).toBe('AssemblyError');
    expect(err.message).toBe('Run not found');
    expect(err.code).toBe('RUN_NOT_FOUND');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AssemblyError);
  });
});
