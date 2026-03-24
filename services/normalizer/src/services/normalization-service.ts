import type {
  RawVendorEvent,
  NormalizationResult,
} from '@tracereplay/connectors-core';
import {
  AdapterRegistry,
  PassthroughAdapter,
  OpenAIAgentsAdapter,
  OpenAICodexAdapter,
  GitHubCopilotAdapter,
  ClaudeCodeAdapter,
} from '@tracereplay/connectors-core';
import type { NormalizerStats } from '../types.js';

// ---------------------------------------------------------------------------
// NormalizationService — stateless domain logic
// ---------------------------------------------------------------------------

export class NormalizationService {
  private readonly registry: AdapterRegistry;
  private readonly stats: NormalizerStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  constructor(registry?: AdapterRegistry) {
    this.registry = registry ?? NormalizationService.createDefaultRegistry();
  }

  /**
   * Create a registry pre-loaded with built-in adapters.
   */
  static createDefaultRegistry(): AdapterRegistry {
    const registry = new AdapterRegistry();
    registry.register(new PassthroughAdapter());
    registry.register(new OpenAIAgentsAdapter());
    registry.register(new OpenAICodexAdapter());
    registry.register(new GitHubCopilotAdapter());
    registry.register(new ClaudeCodeAdapter());
    return registry;
  }

  /**
   * Normalize a raw vendor event into canonical events.
   *
   * 1. Resolve the adapter based on vendor ID / probing.
   * 2. Run the adapter's `normalize()` method.
   * 3. Track stats.
   */
  normalizeEvent(raw: RawVendorEvent): NormalizationResult {
    this.stats.processed++;

    const adapter = this.registry.resolve(raw);

    if (!adapter) {
      this.stats.failed++;
      return {
        status: 'error',
        reason: `No adapter found for vendor "${raw.vendor}"`,
        rawEvent: raw,
      };
    }

    const result = adapter.normalize(raw);

    if (result.status === 'success') {
      this.stats.succeeded++;
    } else {
      this.stats.failed++;
    }

    return result;
  }

  /**
   * Normalize a batch of raw events.
   * Returns results in the same order as input.
   */
  normalizeBatch(rawEvents: RawVendorEvent[]): NormalizationResult[] {
    return rawEvents.map((raw) => this.normalizeEvent(raw));
  }

  /** Increment dead-letter counter. Called by queue processor on final failure. */
  recordDeadLetter(): void {
    this.stats.deadLettered++;
  }

  /** Get current stats snapshot. */
  getStats(): Readonly<NormalizerStats> {
    return { ...this.stats };
  }

  /** Get the underlying adapter registry for registration/inspection. */
  getRegistry(): AdapterRegistry {
    return this.registry;
  }
}
