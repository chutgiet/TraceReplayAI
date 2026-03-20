import { validateEvent } from '@tracereplay/event-schema';
import type { TraceReplayEvent } from '@tracereplay/event-schema';
import type {
  NormalizerAdapter,
  NormalizationResult,
  RawVendorEvent,
} from './types.js';

/**
 * Passthrough adapter for events that are already in canonical TraceReplay format.
 *
 * Validates the raw event data against the canonical schema:
 * - If valid → passes through as-is
 * - If invalid → returns normalization error
 *
 * This adapter is the default fallback and handles SDK-originated events
 * that don't need vendor-specific mapping.
 */
export class PassthroughAdapter implements NormalizerAdapter {
  readonly vendorId = 'tracereplay';
  readonly displayName = 'Passthrough (canonical format)';

  canHandle(raw: RawVendorEvent): boolean {
    // Canonical events have a `type` field matching our event types
    // and the required BaseEvent structure
    const data = raw.data;
    return (
      typeof data['type'] === 'string' &&
      typeof data['id'] === 'string' &&
      typeof data['runId'] === 'string' &&
      typeof data['tenantId'] === 'string' &&
      typeof data['schemaVersion'] === 'string'
    );
  }

  normalize(raw: RawVendorEvent): NormalizationResult {
    const validation = validateEvent(raw.data);

    if (!validation.success) {
      return {
        status: 'error',
        reason: `Passthrough validation failed: ${validation.error.issues.map((i) => i.message).join('; ')}`,
        rawEvent: raw,
      };
    }

    const event: TraceReplayEvent = validation.data;

    // Preserve raw ingestion metadata if not already present
    if (!event.rawMeta) {
      (event as Record<string, unknown>).rawMeta = {
        normalizedBy: this.vendorId,
        receivedAt: raw.receivedAt,
      };
    }

    return {
      status: 'success',
      events: [event],
    };
  }
}
