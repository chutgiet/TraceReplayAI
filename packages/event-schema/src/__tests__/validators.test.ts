import { describe, it, expect } from 'vitest';
import {
  validateEvent,
  isValidEventType,
  createBaseEvent,
  baseEventSchema,
  traceReplayEventSchema,
  payloadSchemaMap,
  EVENT_TYPES,
  SCHEMA_VERSION,
} from '../index.js';
import type { EventType } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const VALID_TIMESTAMP = '2026-03-15T10:00:00.000Z';

function makeEvent(type: EventType, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: VALID_UUID,
    runId: VALID_UUID_2,
    type,
    timestamp: VALID_TIMESTAMP,
    tenantId: 'tenant-abc',
    sourceAgent: 'test-agent',
    payload,
    schemaVersion: SCHEMA_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Payload fixtures — minimal valid payloads for each event type
// ---------------------------------------------------------------------------

const VALID_PAYLOADS: Record<EventType, Record<string, unknown>> = {
  'run.start': {},
  'run.end': { status: 'success' },
  'run.error': { errorType: 'RuntimeError', errorMessage: 'something broke', fatal: true },
  'prompt.input': { role: 'user', content: 'hello' },
  'prompt.output': { content: 'world' },
  'context.retrieved': { source: 'vector_db' },
  'context.injected': { source: 'file' },
  'tool.call.start': { toolName: 'search', inputParameters: { q: 'test' } },
  'tool.call.end': { toolName: 'search', output: { results: [] }, success: true },
  'tool.call.error': { toolName: 'search', errorType: 'Timeout', errorMessage: 'timed out' },
  'approval.requested': { approvalType: 'human', requestedAction: 'deploy', requestedBy: 'agent-1' },
  'approval.granted': { approvalType: 'human', decidedBy: 'user-1' },
  'approval.denied': { approvalType: 'policy', decidedBy: 'system' },
  'side_effect.executed': { effectType: 'api_call', targetSystem: 'slack', description: 'send message', reversible: false },
  'side_effect.failed': { effectType: 'email', targetSystem: 'smtp', description: 'send email', errorType: 'SmtpError', errorMessage: 'connection refused' },
  'model.request': { modelProvider: 'openai', modelId: 'gpt-4' },
  'model.response': { modelProvider: 'anthropic', modelId: 'claude-3' },
  'policy.evaluated': { policyId: 'p1', policyName: 'content-safety', result: 'pass' },
  'policy.violated': { policyId: 'p2', policyName: 'rate-limit', result: 'fail' },
  'annotation': { key: 'note', value: 'looks good' },
  'custom': {},
};

// ---------------------------------------------------------------------------
// isValidEventType
// ---------------------------------------------------------------------------

describe('isValidEventType', () => {
  it('returns true for all known event types', () => {
    for (const type of EVENT_TYPES) {
      expect(isValidEventType(type)).toBe(true);
    }
  });

  it('returns false for unknown strings', () => {
    expect(isValidEventType('unknown.type')).toBe(false);
    expect(isValidEventType('')).toBe(false);
    expect(isValidEventType('run')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// baseEventSchema
// ---------------------------------------------------------------------------

describe('baseEventSchema', () => {
  it('validates a well-formed base event', () => {
    const event = makeEvent('run.start', {});
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects missing required field: id', () => {
    const event = makeEvent('run.start', {});
    delete event['id'];
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field: runId', () => {
    const event = makeEvent('run.start', {});
    delete event['runId'];
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field: type', () => {
    const event = makeEvent('run.start', {});
    delete event['type'];
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field: timestamp', () => {
    const event = makeEvent('run.start', {});
    delete event['timestamp'];
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects missing required field: tenantId', () => {
    const event = makeEvent('run.start', {});
    delete event['tenantId'];
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for id', () => {
    const event = makeEvent('run.start', {});
    event['id'] = 'not-a-uuid';
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects invalid event type', () => {
    const event = makeEvent('run.start', {});
    event['type'] = 'invalid.type';
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects invalid timestamp format', () => {
    const event = makeEvent('run.start', {});
    event['timestamp'] = 'not-a-date';
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects empty tenantId', () => {
    const event = makeEvent('run.start', {});
    event['tenantId'] = '';
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('accepts optional fields when present', () => {
    const event = {
      ...makeEvent('run.start', {}),
      sequence: 1,
      parentEventId: VALID_UUID,
      sourceFramework: 'langchain',
      rawMeta: { vendor: 'openai' },
      tags: ['test', 'debug'],
    };
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts optional fields when absent', () => {
    const event = makeEvent('run.start', {});
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts empty tags array', () => {
    const event = { ...makeEvent('run.start', {}), tags: [] };
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects negative sequence number', () => {
    const event = { ...makeEvent('run.start', {}), sequence: -1 };
    const result = baseEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// traceReplayEventSchema — validates each event type
// ---------------------------------------------------------------------------

describe('traceReplayEventSchema', () => {
  describe('accepts valid events for every type', () => {
    for (const type of EVENT_TYPES) {
      it(`validates ${type}`, () => {
        const event = makeEvent(type, VALID_PAYLOADS[type]!);
        const result = traceReplayEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      });
    }
  });

  describe('rejects events with wrong payload for type', () => {
    it('rejects run.end without status', () => {
      const event = makeEvent('run.end', {});
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects run.end with invalid status', () => {
      const event = makeEvent('run.end', { status: 'running' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects run.error without required fields', () => {
      const event = makeEvent('run.error', { errorType: 'Err' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects prompt.input without role', () => {
      const event = makeEvent('prompt.input', { content: 'hello' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects prompt.input with invalid role', () => {
      const event = makeEvent('prompt.input', { role: 'moderator', content: 'hi' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects tool.call.start without inputParameters', () => {
      const event = makeEvent('tool.call.start', { toolName: 'x' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects tool.call.end without success flag', () => {
      const event = makeEvent('tool.call.end', { toolName: 'x', output: null });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects side_effect.executed without reversible flag', () => {
      const event = makeEvent('side_effect.executed', {
        effectType: 'api_call', targetSystem: 'test', description: 'test',
      });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects model.request without modelProvider', () => {
      const event = makeEvent('model.request', { modelId: 'gpt-4' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects policy.evaluated without result', () => {
      const event = makeEvent('policy.evaluated', { policyId: 'p1', policyName: 'test' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects policy.evaluated with invalid result', () => {
      const event = makeEvent('policy.evaluated', { policyId: 'p1', policyName: 'test', result: 'maybe' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects annotation without key', () => {
      const event = makeEvent('annotation', { value: 'test' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('passthrough preserves extra payload fields', () => {
    it('preserves extra fields in run.start payload', () => {
      const event = makeEvent('run.start', { runName: 'test', extraField: 'preserved' });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data.payload as Record<string, unknown>)['extraField']).toBe('preserved');
      }
    });
  });

  describe('optional payload fields', () => {
    it('run.start accepts all optional fields', () => {
      const event = makeEvent('run.start', {
        runName: 'my-run',
        triggerSource: 'api',
        parentRunId: VALID_UUID_2,
        configuration: { model: 'gpt-4' },
      });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('run.end accepts optional durationMs and summary', () => {
      const event = makeEvent('run.end', {
        status: 'failure',
        durationMs: 1234,
        summary: 'Failed due to timeout',
      });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('prompt.input accepts optional tokenCount and contentHash', () => {
      const event = makeEvent('prompt.input', {
        role: 'system',
        content: 'You are helpful',
        contentHash: 'abc123',
        tokenCount: 5,
      });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('model.request accepts all optional numeric fields', () => {
      const event = makeEvent('model.request', {
        modelProvider: 'openai',
        modelId: 'gpt-4',
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 234.5,
        cost: 0.003,
        temperature: 0.7,
      });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects negative durationMs', () => {
      const event = makeEvent('run.end', { status: 'success', durationMs: -10 });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects negative tokenCount', () => {
      const event = makeEvent('prompt.input', { role: 'user', content: 'hi', tokenCount: -1 });
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// validateEvent helper
// ---------------------------------------------------------------------------

describe('validateEvent', () => {
  it('returns success with typed data for valid event', () => {
    const event = makeEvent('run.start', { runName: 'my-run' });
    const result = validateEvent(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('run.start');
      expect(result.data.id).toBe(VALID_UUID);
    }
  });

  it('returns failure with ZodError for invalid event', () => {
    const result = validateEvent({ garbage: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('returns failure for null input', () => {
    const result = validateEvent(null);
    expect(result.success).toBe(false);
  });

  it('returns failure for undefined input', () => {
    const result = validateEvent(undefined);
    expect(result.success).toBe(false);
  });

  it('returns failure for primitive input', () => {
    const result = validateEvent('just a string');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createBaseEvent helper
// ---------------------------------------------------------------------------

describe('createBaseEvent', () => {
  it('creates a valid base event for any type', () => {
    for (const type of EVENT_TYPES) {
      const event = createBaseEvent(type, VALID_PAYLOADS[type]!);
      const result = traceReplayEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });

  it('sets schemaVersion to current version', () => {
    const event = createBaseEvent('run.start', {});
    expect(event['schemaVersion']).toBe(SCHEMA_VERSION);
  });

  it('generates unique IDs on each call', () => {
    const a = createBaseEvent('run.start', {});
    const b = createBaseEvent('run.start', {});
    expect(a['id']).not.toBe(b['id']);
  });
});

// ---------------------------------------------------------------------------
// payloadSchemaMap coverage
// ---------------------------------------------------------------------------

describe('payloadSchemaMap', () => {
  it('has a schema for every event type', () => {
    for (const type of EVENT_TYPES) {
      expect(payloadSchemaMap[type]).toBeDefined();
    }
  });

  it('each payload schema validates its corresponding fixture', () => {
    for (const type of EVENT_TYPES) {
      const schema = payloadSchemaMap[type];
      const result = schema.safeParse(VALID_PAYLOADS[type]);
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('EVENT_TYPES has 21 entries', () => {
    expect(EVENT_TYPES).toHaveLength(21);
  });

  it('SCHEMA_VERSION is 1.0.0', () => {
    expect(SCHEMA_VERSION).toBe('1.0.0');
  });
});
