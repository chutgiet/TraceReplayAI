import { Worker, Queue } from 'bullmq';
import type { Job, ConnectionOptions } from 'bullmq';
import { getEventsByRunId } from '@tracereplay/common';
import type { InsertEventRow } from '@tracereplay/common';
import { SCHEMA_VERSION } from '@tracereplay/event-schema';
import { OllamaClient } from './client.js';
import { processRunSummary } from './jobs/run-summary.js';
import { processAnomalyCheck } from './jobs/anomaly-check.js';
import { processComplianceScan } from './jobs/compliance-scan.js';
import type {
  OllamaJobData,
  OllamaDeadLetterEntry,
  OllamaProcessorStats,
} from './types.js';
import { QUEUE_NAMES } from './types.js';

// ---------------------------------------------------------------------------
// Callback types
// ---------------------------------------------------------------------------

export type OnCompleteCallback = (
  annotationEvents: InsertEventRow[],
  jobId: string,
) => Promise<void>;

export type OnDeadLetterCallback = (
  jobData: OllamaJobData,
  reason: string,
  jobId: string,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Worker options
// ---------------------------------------------------------------------------

export interface OllamaWorkerOptions {
  connection: ConnectionOptions;
  concurrency?: number;
  ollamaClient: OllamaClient;
  onComplete: OnCompleteCallback;
  onDeadLetter?: OnDeadLetterCallback;
}

// ---------------------------------------------------------------------------
// OllamaProcessingWorker — BullMQ worker for ollama processing queue
// ---------------------------------------------------------------------------

export class OllamaProcessingWorker {
  readonly name = 'ollama-processing-worker';
  readonly queueName = QUEUE_NAMES.OLLAMA_PROCESSING;

  private readonly client: OllamaClient;
  private readonly deadLetterQueue: Queue<OllamaDeadLetterEntry>;
  private worker: Worker<OllamaJobData> | null = null;
  private readonly options: OllamaWorkerOptions;

  private readonly stats: OllamaProcessorStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
    ollamaUnavailable: 0,
  };

  constructor(options: OllamaWorkerOptions) {
    this.options = options;
    this.client = options.ollamaClient;
    this.deadLetterQueue = new Queue<OllamaDeadLetterEntry>(
      QUEUE_NAMES.OLLAMA_DLQ,
      { connection: options.connection },
    );
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.worker) return;

    this.worker = new Worker<OllamaJobData>(
      QUEUE_NAMES.OLLAMA_PROCESSING,
      async (job: Job<OllamaJobData>) => {
        await this.processJob(job);
      },
      {
        connection: this.options.connection,
        concurrency: this.options.concurrency ?? 3,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );

    this.worker.on('error', (err) => {
      process.stderr.write(
        `[ollama-processing-worker] BullMQ error: ${err.message}\n`,
      );
    });
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.deadLetterQueue.close();
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getStats(): Readonly<OllamaProcessorStats> {
    return { ...this.stats };
  }

  isRunning(): boolean {
    return this.worker !== null;
  }

  // -----------------------------------------------------------------------
  // Job processing
  // -----------------------------------------------------------------------

  private async processJob(job: Job<OllamaJobData>): Promise<void> {
    const { runId, tenantId, type, jobId } = job.data;
    this.stats.processed++;

    // Check Ollama availability before doing work
    const available = await this.client.isAvailable();
    if (!available) {
      this.stats.ollamaUnavailable++;
      // Graceful degradation: skip processing, don't fail the job
      return;
    }

    // Fetch all events for this run
    const events = await getEventsByRunId(runId);
    if (events.length === 0) {
      return; // Nothing to process
    }

    // Dispatch to the appropriate job handler
    let annotationKey: string;
    let annotationValue: unknown;

    switch (type) {
      case 'run-summary': {
        const result = await processRunSummary(events, this.client);
        annotationKey = 'ollama:run-summary';
        annotationValue = result;
        break;
      }
      case 'anomaly-check': {
        const result = await processAnomalyCheck(events, this.client);
        annotationKey = 'ollama:anomaly-check';
        annotationValue = result;
        break;
      }
      case 'compliance-scan': {
        const result = await processComplianceScan(events, this.client);
        annotationKey = 'ollama:compliance-scan';
        annotationValue = result;
        break;
      }
      default: {
        await this.handleFailure(job.data, `Unknown job type: ${type}`, jobId);
        return;
      }
    }

    // Build annotation event
    const annotationEvent: InsertEventRow = {
      id: crypto.randomUUID(),
      run_id: runId,
      tenant_id: tenantId,
      type: 'annotation',
      sequence: null,
      parent_event_id: null,
      source_agent: 'ollama-processor',
      source_framework: `ollama/${this.client.getModel()}`,
      payload: {
        key: annotationKey,
        value: annotationValue,
        annotatedBy: 'ollama-processor',
      },
      raw_meta: null,
      tags: ['ollama', type],
      schema_version: SCHEMA_VERSION,
      timestamp: new Date(),
    };

    await this.options.onComplete([annotationEvent], jobId);
    this.stats.succeeded++;
  }

  private async handleFailure(
    jobData: OllamaJobData,
    reason: string,
    jobId: string,
  ): Promise<void> {
    this.stats.failed++;
    this.stats.deadLettered++;

    await this.deadLetterQueue.add('dead-letter', {
      originalJobId: jobId,
      type: jobData.type,
      runId: jobData.runId,
      reason,
      failedAt: new Date().toISOString(),
    });

    await this.options.onDeadLetter?.(jobData, reason, jobId);
  }
}

// ---------------------------------------------------------------------------
// Queue factory — for producers that enqueue ollama processing jobs
// ---------------------------------------------------------------------------

export function createOllamaProcessingQueue(
  connection: ConnectionOptions,
): Queue<OllamaJobData> {
  return new Queue<OllamaJobData>(QUEUE_NAMES.OLLAMA_PROCESSING, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
