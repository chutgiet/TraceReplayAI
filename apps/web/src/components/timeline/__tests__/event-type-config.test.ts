import { describe, it, expect } from 'vitest';
import { getEventTypeConfig, getEventSummary } from '../event-type-config';

describe('getEventTypeConfig', () => {
  it('returns config for known event types', () => {
    const config = getEventTypeConfig('run.start');
    expect(config.label).toBe('Run Start');
    expect(config.dotColor).toBeTruthy();
    expect(config.barColor).toBeTruthy();
    expect(config.icon).toBe('▶');
  });

  it('returns config for tool.call.start', () => {
    const config = getEventTypeConfig('tool.call.start');
    expect(config.label).toBe('Tool Call');
    expect(config.dotColor).toBe('bg-green-500');
    expect(config.icon).toBe('⚙');
  });

  it('returns config for run.error', () => {
    const config = getEventTypeConfig('run.error');
    expect(config.label).toBe('Run Error');
    expect(config.dotColor).toBe('bg-red-500');
  });

  it('returns config for prompt.input', () => {
    const config = getEventTypeConfig('prompt.input');
    expect(config.label).toBe('Prompt Input');
    expect(config.dotColor).toBe('bg-blue-500');
  });

  it('returns config for approval.requested', () => {
    const config = getEventTypeConfig('approval.requested');
    expect(config.label).toBe('Approval Requested');
    expect(config.dotColor).toBe('bg-purple-500');
  });

  it('returns config for side_effect.executed', () => {
    const config = getEventTypeConfig('side_effect.executed');
    expect(config.label).toBe('Side Effect');
    expect(config.dotColor).toBe('bg-amber-500');
  });

  it('returns config for model.request', () => {
    const config = getEventTypeConfig('model.request');
    expect(config.label).toBe('Model Request');
    expect(config.dotColor).toBe('bg-indigo-500');
  });

  it('returns default config for unknown event types', () => {
    const config = getEventTypeConfig('some.unknown.type');
    expect(config.label).toBe('Unknown');
    expect(config.dotColor).toBe('bg-gray-400');
    expect(config.icon).toBe('•');
  });
});

describe('getEventSummary', () => {
  it('summarizes run.start with runName', () => {
    expect(getEventSummary('run.start', { runName: 'my-run' })).toBe('Run: my-run');
  });

  it('summarizes run.start without runName', () => {
    expect(getEventSummary('run.start', {})).toBe('Run started');
  });

  it('summarizes run.end', () => {
    expect(getEventSummary('run.end', { status: 'success' })).toBe('Status: success');
  });

  it('summarizes run.error', () => {
    expect(
      getEventSummary('run.error', { errorType: 'TypeError', errorMessage: 'null ref' }),
    ).toBe('TypeError: null ref');
  });

  it('summarizes prompt.input with truncation', () => {
    const long = 'A'.repeat(100);
    const result = getEventSummary('prompt.input', { content: long });
    expect(result.length).toBe(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('summarizes prompt.input without truncation', () => {
    expect(getEventSummary('prompt.input', { content: 'Hello' })).toBe('Hello');
  });

  it('summarizes tool.call.start', () => {
    expect(getEventSummary('tool.call.start', { toolName: 'search' })).toBe('search(…)');
  });

  it('summarizes tool.call.end with success', () => {
    expect(
      getEventSummary('tool.call.end', { toolName: 'search', success: true }),
    ).toBe('search → success');
  });

  it('summarizes tool.call.end with failure', () => {
    expect(
      getEventSummary('tool.call.end', { toolName: 'search', success: false }),
    ).toBe('search → failed');
  });

  it('summarizes tool.call.error', () => {
    expect(
      getEventSummary('tool.call.error', { toolName: 'search', errorMessage: 'timeout' }),
    ).toBe('search: timeout');
  });

  it('summarizes context.retrieved', () => {
    expect(
      getEventSummary('context.retrieved', { source: 'vector_db', snippetCount: 3 }),
    ).toBe('Source: vector_db (3 snippets)');
  });

  it('summarizes approval.requested', () => {
    expect(
      getEventSummary('approval.requested', { requestedAction: 'deploy' }),
    ).toBe('Action: deploy');
  });

  it('summarizes approval.granted', () => {
    expect(
      getEventSummary('approval.granted', { decidedBy: 'admin' }),
    ).toBe('Granted by admin');
  });

  it('summarizes approval.denied with reason', () => {
    expect(
      getEventSummary('approval.denied', { decidedBy: 'admin', reason: 'too risky' }),
    ).toBe('Denied by admin: too risky');
  });

  it('summarizes side_effect.executed', () => {
    expect(
      getEventSummary('side_effect.executed', { effectType: 'api_call', description: 'POST /api' }),
    ).toBe('api_call: POST /api');
  });

  it('summarizes model.request', () => {
    expect(
      getEventSummary('model.request', { modelProvider: 'openai', modelId: 'gpt-4' }),
    ).toBe('openai/gpt-4');
  });

  it('summarizes model.response with latency', () => {
    expect(
      getEventSummary('model.response', { modelProvider: 'openai', modelId: 'gpt-4', latencyMs: 250 }),
    ).toBe('openai/gpt-4 (250ms)');
  });

  it('summarizes policy.evaluated', () => {
    expect(
      getEventSummary('policy.evaluated', { policyName: 'safety', result: 'pass' }),
    ).toBe('safety: pass');
  });

  it('summarizes policy.violated', () => {
    expect(
      getEventSummary('policy.violated', { policyName: 'safety' }),
    ).toBe('safety violated');
  });

  it('returns type string for unknown types', () => {
    expect(getEventSummary('custom.something', {})).toBe('custom.something');
  });
});
