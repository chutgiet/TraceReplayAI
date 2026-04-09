import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventRow } from '@tracereplay/common';
import { OllamaClient } from '../client.js';
import { processRunSummary } from '../jobs/run-summary.js';
import { processAnomalyCheck } from '../jobs/anomaly-check.js';
import { processComplianceScan } from '../jobs/compliance-scan.js';

// ---------------------------------------------------------------------------
// Job handler tests with mocked Ollama responses
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: 'evt-001',
    run_id: 'run-001',
    tenant_id: 'tenant-1',
    type: 'tool.call.start',
    sequence: 1,
    parent_event_id: null,
    source_agent: 'copilot',
    source_framework: null,
    payload: { toolName: 'read_file', toolInput: { path: '/test.ts' } },
    raw_meta: null,
    tags: [],
    schema_version: '1.0.0',
    timestamp: new Date('2026-04-08T10:00:00Z'),
    received_at: new Date('2026-04-08T10:00:01Z'),
    ingestion_order: 1,
    ...overrides,
  } as EventRow;
}

function makeEvents(): EventRow[] {
  return [
    makeEvent({ id: 'evt-1', type: 'run.start', payload: { runName: 'test-run' } }),
    makeEvent({ id: 'evt-2', type: 'tool.call.start', payload: { toolName: 'read_file' } }),
    makeEvent({ id: 'evt-3', type: 'tool.call.end', payload: { toolName: 'read_file', success: true } }),
    makeEvent({ id: 'evt-4', type: 'model.request', payload: { modelId: 'gpt-4o' } }),
    makeEvent({ id: 'evt-5', type: 'model.response', payload: { modelId: 'gpt-4o', outputTokens: 500 } }),
    makeEvent({ id: 'evt-6', type: 'run.end', payload: { status: 'success' } }),
  ];
}

let client: OllamaClient;

beforeEach(() => {
  client = new OllamaClient({
    baseUrl: 'http://localhost:11434',
    model: 'deepseek-r1:14b',
    timeoutMs: 5000,
  });
});

// ---------------------------------------------------------------------------
// Run Summary
// ---------------------------------------------------------------------------

describe('processRunSummary', () => {
  it('returns parsed summary from Ollama response', async () => {
    const ollamaResponse = {
      summary: 'Agent read a file and generated code',
      keyDecisions: ['Used read_file to inspect source'],
      sideEffects: ['No side effects'],
      toolCallCount: 1,
      modelInvocationCount: 1,
      flags: [],
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: JSON.stringify(ollamaResponse),
      done: true,
    });

    const result = await processRunSummary(makeEvents(), client);

    expect(result.summary).toBe('Agent read a file and generated code');
    expect(result.keyDecisions).toHaveLength(1);
    expect(result.toolCallCount).toBe(1);
  });

  it('returns fallback when Ollama is unavailable', async () => {
    vi.spyOn(client, 'generate').mockResolvedValueOnce(null);

    const result = await processRunSummary(makeEvents(), client);

    expect(result.flags).toContain('ollama-unavailable');
    expect(result.summary).toContain('unavailable');
  });

  it('handles non-JSON Ollama response', async () => {
    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: 'This is not JSON, just a plain text summary.',
      done: true,
    });

    const result = await processRunSummary(makeEvents(), client);

    expect(result.flags).toContain('parse-failed');
    expect(result.summary).toContain('This is not JSON');
  });

  it('handles DeepSeek R1 response with think blocks', async () => {
    const ollamaResponse = {
      summary: 'Agent completed task',
      keyDecisions: [],
      sideEffects: [],
      toolCallCount: 1,
      modelInvocationCount: 1,
      flags: [],
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: `<think>\nLet me analyze the events...\n</think>\n${JSON.stringify(ollamaResponse)}`,
      done: true,
    });

    const result = await processRunSummary(makeEvents(), client);
    expect(result.summary).toBe('Agent completed task');
  });
});

// ---------------------------------------------------------------------------
// Anomaly Check
// ---------------------------------------------------------------------------

describe('processAnomalyCheck', () => {
  it('returns parsed anomaly results', async () => {
    const ollamaResponse = {
      anomaliesFound: true,
      anomalies: [
        {
          type: 'excessive_failures',
          severity: 'high',
          description: 'Tool failures exceed 50%',
          eventIds: ['evt-2'],
        },
      ],
      overallRiskLevel: 'high',
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: JSON.stringify(ollamaResponse),
      done: true,
    });

    const result = await processAnomalyCheck(makeEvents(), client);

    expect(result.anomaliesFound).toBe(true);
    expect(result.anomalies).toHaveLength(1);
    expect(result.overallRiskLevel).toBe('high');
  });

  it('returns fallback when Ollama is unavailable', async () => {
    vi.spyOn(client, 'generate').mockResolvedValueOnce(null);

    const result = await processAnomalyCheck(makeEvents(), client);

    expect(result.anomaliesFound).toBe(false);
    expect(result.overallRiskLevel).toBe('low');
  });

  it('returns no anomalies for clean run', async () => {
    const ollamaResponse = {
      anomaliesFound: false,
      anomalies: [],
      overallRiskLevel: 'low',
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: JSON.stringify(ollamaResponse),
      done: true,
    });

    const result = await processAnomalyCheck(makeEvents(), client);
    expect(result.anomaliesFound).toBe(false);
    expect(result.anomalies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Compliance Scan
// ---------------------------------------------------------------------------

describe('processComplianceScan', () => {
  it('returns parsed compliance results', async () => {
    const ollamaResponse = {
      violationsFound: true,
      violations: [
        {
          type: 'sensitive_data',
          severity: 'high',
          description: 'API key detected in prompt',
          eventIds: ['evt-4'],
          recommendation: 'Use environment variables for secrets',
        },
      ],
      complianceScore: 60,
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: JSON.stringify(ollamaResponse),
      done: true,
    });

    const result = await processComplianceScan(makeEvents(), client);

    expect(result.violationsFound).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.complianceScore).toBe(60);
  });

  it('returns fallback when Ollama is unavailable', async () => {
    vi.spyOn(client, 'generate').mockResolvedValueOnce(null);

    const result = await processComplianceScan(makeEvents(), client);

    expect(result.violationsFound).toBe(false);
    expect(result.complianceScore).toBe(100);
  });

  it('clamps compliance score to 0-100', async () => {
    const ollamaResponse = {
      violationsFound: false,
      violations: [],
      complianceScore: 150,
    };

    vi.spyOn(client, 'generate').mockResolvedValueOnce({
      model: 'deepseek-r1:14b',
      response: JSON.stringify(ollamaResponse),
      done: true,
    });

    const result = await processComplianceScan(makeEvents(), client);
    expect(result.complianceScore).toBe(100);
  });
});
