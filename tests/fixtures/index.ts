import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import { validateEvent } from '@tracereplay/event-schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = resolve(__dirname, 'runs');

// ---------------------------------------------------------------------------
// Fixture names
// ---------------------------------------------------------------------------

export const FIXTURE_NAMES = [
  'simple-chat-run',
  'multi-tool-run',
  'error-run',
  'partial-telemetry-run',
  'approval-denied-run',
  'out-of-order-run',
  'sub-agent-delegation-run',
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load a fixture run by name.
 * Returns the raw parsed JSON array (unvalidated).
 */
export function loadFixtureRaw(name: FixtureName): unknown[] {
  const filePath = resolve(RUNS_DIR, `${name}.json`);
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as unknown[];
}

/**
 * Load and validate a fixture run by name.
 * Each event is validated through the Zod schema — throws on first invalid event.
 */
export function loadFixture(name: FixtureName): TraceReplayEvent[] {
  const raw = loadFixtureRaw(name);
  const events: TraceReplayEvent[] = [];

  for (let i = 0; i < raw.length; i++) {
    const result = validateEvent(raw[i]);
    if (!result.success) {
      throw new Error(
        `Fixture "${name}" event at index ${i} failed validation: ${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    events.push(result.data);
  }

  return events;
}

/**
 * Load all fixture runs, validated.
 */
export function loadAllFixtures(): Record<FixtureName, TraceReplayEvent[]> {
  const result = {} as Record<FixtureName, TraceReplayEvent[]>;
  for (const name of FIXTURE_NAMES) {
    result[name] = loadFixture(name);
  }
  return result;
}
