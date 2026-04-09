import type { EventRow } from '@tracereplay/common';
import type { OllamaClient } from '../client.js';
import { buildRunSummaryPrompt } from '../prompts/index.js';
import { formatRunEventsForPrompt, parseOllamaJson } from './helpers.js';

// ---------------------------------------------------------------------------
// Run Summary job handler
// ---------------------------------------------------------------------------

export interface RunSummaryResult {
  summary: string;
  keyDecisions: string[];
  sideEffects: string[];
  toolCallCount: number;
  modelInvocationCount: number;
  flags: string[];
}

const FALLBACK_RESULT: RunSummaryResult = {
  summary: 'Summary unavailable — Ollama processing failed',
  keyDecisions: [],
  sideEffects: [],
  toolCallCount: 0,
  modelInvocationCount: 0,
  flags: ['ollama-unavailable'],
};

export async function processRunSummary(
  events: EventRow[],
  client: OllamaClient,
): Promise<RunSummaryResult> {
  const context = formatRunEventsForPrompt(events);
  const prompt = buildRunSummaryPrompt(context);

  const response = await client.generate(prompt);
  if (!response) {
    return FALLBACK_RESULT;
  }

  const parsed = parseOllamaJson(response.response);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...FALLBACK_RESULT,
      summary: response.response.slice(0, 500),
      flags: ['parse-failed'],
    };
  }

  const result = parsed as Record<string, unknown>;
  return {
    summary: typeof result['summary'] === 'string' ? result['summary'] : FALLBACK_RESULT.summary,
    keyDecisions: Array.isArray(result['keyDecisions']) ? result['keyDecisions'] as string[] : [],
    sideEffects: Array.isArray(result['sideEffects']) ? result['sideEffects'] as string[] : [],
    toolCallCount: typeof result['toolCallCount'] === 'number' ? result['toolCallCount'] : 0,
    modelInvocationCount: typeof result['modelInvocationCount'] === 'number' ? result['modelInvocationCount'] : 0,
    flags: Array.isArray(result['flags']) ? result['flags'] as string[] : [],
  };
}
