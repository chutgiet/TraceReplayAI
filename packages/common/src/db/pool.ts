import { Pool, type PoolConfig } from 'pg';

let _pool: Pool | null = null;

/**
 * Returns the singleton Pool for the current process.
 * On first call, creates an open Pool from DATABASE_URL or explicit config.
 */
export function getPool(config?: PoolConfig): Pool {
  if (!_pool) {
    _pool = new Pool(
      config ?? {
        connectionString:
          process.env['DATABASE_URL'] ??
          'postgres://tracereplay:tracereplay@localhost:5432/tracereplay',
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      },
    );

    _pool.on('error', (err: Error) => {
      // Emit to stderr so structured loggers can pick it up
      process.stderr.write(`[db] Idle client error: ${err.message}\n`);
    });
  }
  return _pool;
}

/**
 * Gracefully closes the singleton Pool.
 * Call on process shutdown to drain in-flight queries to avoid abrupt termination.
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
