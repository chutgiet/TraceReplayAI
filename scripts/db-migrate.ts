#!/usr/bin/env tsx
/**
 * db-migrate.ts
 *
 * Runs pending SQL migration files against the configured PostgreSQL database.
 * Migrations are discovered from infrastructure/db/migrations/ in filename order.
 * The schema_migrations table tracks which migrations have already been applied.
 *
 * Usage:
 *   pnpm db:migrate
 *   DATABASE_URL=postgres://user:pass@host:5432/db tsx scripts/db-migrate.ts
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

// __dirname is available because this file compiles to CommonJS (no "type":"module" in root package.json)
const MIGRATIONS_DIR = resolve(__dirname, '../infrastructure/db/migrations');

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const result = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return new Set(result.rows.map((r: { version: string }) => r.version));
}

async function run(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL']
    ?? 'postgres://tracereplay:tracereplay@localhost:5432/tracereplay';

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('[migrate] Connected to PostgreSQL');

    const applied = await getAppliedMigrations(client);
    console.log(`[migrate] Applied migrations: ${applied.size}`);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const pending = files.filter((f) => {
      // derive version key from filename without extension
      const version = f.replace(/\.sql$/, '');
      return !applied.has(version);
    });

    if (pending.length === 0) {
      console.log('[migrate] Nothing to migrate — database is up to date');
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s): ${pending.join(', ')}`);

    for (const file of pending) {
      const version = file.replace(/\.sql$/, '');
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');

      console.log(`[migrate] Applying: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
          [version],
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied: ${file} ✓`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] Failed: ${file}`, err);
        process.exit(1);
      }
    }

    console.log('[migrate] All migrations applied ✓');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('[migrate] Unexpected error', err);
  process.exit(1);
});

