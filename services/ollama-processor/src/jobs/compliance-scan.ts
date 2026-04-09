import type { EventRow } from '@tracereplay/common';
import type { OllamaClient } from '../client.js';
import { buildComplianceScanPrompt } from '../prompts/index.js';
import { formatRunEventsForPrompt, parseOllamaJson } from './helpers.js';

// ---------------------------------------------------------------------------
// Compliance Scan job handler
// ---------------------------------------------------------------------------

export interface ComplianceViolation {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  eventIds: string[];
  recommendation: string;
}

export interface ComplianceScanResult {
  violationsFound: boolean;
  violations: ComplianceViolation[];
  complianceScore: number;
}

const FALLBACK_RESULT: ComplianceScanResult = {
  violationsFound: false,
  violations: [],
  complianceScore: 100,
};

export async function processComplianceScan(
  events: EventRow[],
  client: OllamaClient,
): Promise<ComplianceScanResult> {
  const context = formatRunEventsForPrompt(events);
  const prompt = buildComplianceScanPrompt(context);

  const response = await client.generate(prompt);
  if (!response) {
    return FALLBACK_RESULT;
  }

  const parsed = parseOllamaJson(response.response);
  if (!parsed || typeof parsed !== 'object') {
    return FALLBACK_RESULT;
  }

  const result = parsed as Record<string, unknown>;
  const violations = Array.isArray(result['violations'])
    ? (result['violations'] as ComplianceViolation[])
    : [];

  return {
    violationsFound: violations.length > 0,
    violations,
    complianceScore: typeof result['complianceScore'] === 'number'
      ? Math.max(0, Math.min(100, result['complianceScore']))
      : 100,
  };
}
