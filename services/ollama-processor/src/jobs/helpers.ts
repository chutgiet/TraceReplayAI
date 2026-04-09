import type { EventRow } from '@tracereplay/common';

// ---------------------------------------------------------------------------
// Shared helpers for formatting run events for Ollama prompts
// ---------------------------------------------------------------------------

/**
 * Build a human-readable context string from run events for use in prompts.
 * Limits output size to avoid exceeding model context windows.
 */
export function formatRunEventsForPrompt(
  events: EventRow[],
  maxEvents = 200,
): string {
  const truncated = events.slice(0, maxEvents);
  const lines = truncated.map((e, i) => {
    const payload = typeof e.payload === 'string'
      ? e.payload
      : JSON.stringify(e.payload, null, 0);
    // Cap individual payload display to avoid token blowout
    const truncatedPayload = payload.length > 500
      ? payload.slice(0, 500) + '…'
      : payload;
    return `[${i + 1}] ${e.timestamp} | ${e.type} | id=${e.id} | agent=${e.source_agent} | ${truncatedPayload}`;
  });

  if (events.length > maxEvents) {
    lines.push(`\n... (${events.length - maxEvents} more events truncated)`);
  }

  return lines.join('\n');
}

/**
 * Safely parse JSON from an Ollama response string.
 * Handles responses wrapped in markdown code blocks.
 */
export function parseOllamaJson(text: string): unknown | null {
  let cleaned = text.trim();

  // Strip <think> blocks from DeepSeek R1 reasoning first
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}
