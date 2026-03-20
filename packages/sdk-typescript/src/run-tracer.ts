import { randomUUID } from 'node:crypto';
import type {
  EventId,
  PromptInputPayload,
  PromptOutputPayload,
  ToolCallStartPayload,
  ToolCallEndPayload,
  ToolCallErrorPayload,
  RunEndPayload,
  RunErrorPayload,
} from '@tracereplay/event-schema';
import type { TraceReplayClient } from './client.js';
import type { StartRunOptions, SendResult } from './types.js';

/**
 * A convenience wrapper around `TraceReplayClient` scoped to a single run.
 * Auto-generates a `runId`, emits `run.start` on creation, and provides
 * typed helper methods for common event types.
 */
export class RunTracer {
  readonly runId: string;
  private readonly client: TraceReplayClient;
  private readonly sourceAgent: string;
  private readonly sourceFramework: string | undefined;
  private readonly tags: string[] | undefined;
  private sequence = 0;
  private ended = false;

  constructor(client: TraceReplayClient, opts: StartRunOptions) {
    this.client = client;
    this.runId = randomUUID();
    this.sourceAgent = opts.sourceAgent;
    this.sourceFramework = opts.sourceFramework;
    this.tags = opts.tags;

    // Emit run.start synchronously-queued (the caller can await the returned promise)
    void this.emitEvent('run.start', {
      runName: opts.runName,
      triggerSource: opts.triggerSource,
      parentRunId: opts.parentRunId,
      configuration: opts.configuration,
    });
  }

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  /** Log a prompt input event. */
  async logPrompt(payload: PromptInputPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('prompt.input', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log a prompt output / model response event. */
  async logPromptOutput(payload: PromptOutputPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('prompt.output', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log the start of a tool call. Returns the generated eventId for causal linking. */
  async logToolCall(payload: ToolCallStartPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('tool.call.start', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log the completion of a tool call. */
  async logToolCallEnd(payload: ToolCallEndPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('tool.call.end', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log a tool call error. */
  async logToolCallError(payload: ToolCallErrorPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('tool.call.error', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log a run-level error. */
  async logError(payload: RunErrorPayload, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('run.error', payload as unknown as Record<string, unknown>, parentEventId);
  }

  /** Log a custom event type. */
  async logCustom(payload: Record<string, unknown>, parentEventId?: string): Promise<SendResult> {
    return this.emitEvent('custom', payload, parentEventId);
  }

  /** Log an annotation. */
  async logAnnotation(
    payload: { key: string; value: unknown; annotatedBy?: string },
    parentEventId?: string,
  ): Promise<SendResult> {
    return this.emitEvent('annotation', payload, parentEventId);
  }

  /** End the run with a status summary. Marks the tracer as ended — no further events accepted. */
  async end(
    status: RunEndPayload['status'] = 'success',
    opts?: { durationMs?: number; summary?: string },
  ): Promise<SendResult> {
    if (this.ended) {
      throw new Error('RunTracer: run has already ended');
    }
    this.ended = true;

    return this.emitEvent('run.end', {
      status,
      durationMs: opts?.durationMs,
      summary: opts?.summary,
    });
  }

  /** Whether this run tracer has already emitted a `run.end` event. */
  get isEnded(): boolean {
    return this.ended;
  }

  // -----------------------------------------------------------------------
  // Generic event emitter
  // -----------------------------------------------------------------------

  /** Emit an arbitrary event type within this run. */
  async emitEvent(
    type: string,
    payload: Record<string, unknown>,
    parentEventId?: string,
  ): Promise<SendResult> {
    if (this.ended && type !== 'run.end') {
      throw new Error('RunTracer: cannot emit events after run has ended');
    }

    const event = this.client.buildEvent(type, this.runId, this.sourceAgent, payload, {
      sequence: this.sequence++,
      sourceFramework: this.sourceFramework,
      tags: this.tags,
      ...(parentEventId ? { parentEventId: parentEventId as EventId } : {}),
    });

    return this.client.sendEvent(event);
  }
}
