import type { EventRow } from '@tracereplay/common';
import type { OllamaClient } from '../client.js';
import { buildAnomalyCheckPrompt } from '../prompts/index.js';
import { formatRunEventsForPrompt, parseOllamaJson } from './helpers.js';

// ---------------------------------------------------------------------------
// Anomaly Check job handler
// ---------------------------------------------------------------------------

export interface AnomalyResult {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  eventIds: string[];
}

export interface AnomalyCheckResult {
  anomaliesFound: boolean;
  anomalies: AnomalyResult[];
  overallRiskLevel: 'low' | 'medium' | 'high';
}

const FALLBACK_RESULT: AnomalyCheckResult = {
  anomaliesFound: false,
  anomalies: [],
  overallRiskLevel: 'low',
};

export async function processAnomalyCheck(
  events: EventRow[],
  client: OllamaClient,
): Promise<AnomalyCheckResult> {
  const context = formatRunEventsForPrompt(events);
  const prompt = buildAnomalyCheckPrompt(context);

  const response = await client.generate(prompt);
  if (!response) {
    return FALLBACK_RESULT;
  }

  const parsed = parseOllamaJson(response.response);
  if (!parsed || typeof parsed !== 'object') {
    return FALLBACK_RESULT;
  }

  const result = parsed as Record<string, unknown>;
  const anomalies = Array.isArray(result['anomalies'])
    ? (result['anomalies'] as AnomalyResult[])
    : [];

  return {
    anomaliesFound: anomalies.length > 0,
    anomalies,
    overallRiskLevel: isRiskLevel(result['overallRiskLevel'])
      ? result['overallRiskLevel']
      : 'low',
  };
}

function isRiskLevel(val: unknown): val is 'low' | 'medium' | 'high' {
  return val === 'low' || val === 'medium' || val === 'high';
}
