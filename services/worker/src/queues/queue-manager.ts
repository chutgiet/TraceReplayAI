import type { QueueWorker } from '../types.js';

// ---------------------------------------------------------------------------
// QueueManager — manages lifecycle of multiple queue workers
// ---------------------------------------------------------------------------

/**
 * Central manager for all BullMQ queue workers.
 * Handles starting, stopping, and health reporting across all registered workers.
 */
export class QueueManager {
  private readonly workers: QueueWorker[] = [];
  private running = false;

  /** Register a queue worker. Must be called before start(). */
  register(worker: QueueWorker): void {
    if (this.running) {
      throw new Error(
        'Cannot register workers after QueueManager has started',
      );
    }
    this.workers.push(worker);
  }

  /** Start all registered workers. */
  async start(): Promise<void> {
    if (this.running) return;

    for (const worker of this.workers) {
      await worker.start();
    }
    this.running = true;
  }

  /** Gracefully stop all workers in reverse order. */
  async stop(): Promise<void> {
    if (!this.running) return;

    // Stop in reverse registration order (LIFO)
    for (let i = this.workers.length - 1; i >= 0; i--) {
      await this.workers[i]!.stop();
    }
    this.running = false;
  }

  /** Whether the manager is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get the list of registered workers (for health checking). */
  getWorkers(): readonly QueueWorker[] {
    return this.workers;
  }

  /** Aggregate stats from all workers, keyed by queue name. */
  getAllStats(): Record<string, ReturnType<QueueWorker['getStats']>> {
    const stats: Record<string, ReturnType<QueueWorker['getStats']>> = {};
    for (const worker of this.workers) {
      stats[worker.queueName] = worker.getStats();
    }
    return stats;
  }
}
