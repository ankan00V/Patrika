import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, pool } from './client.js';
import { logger } from '../lib/logger.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** Safe to call from the API and the worker at the same time: a Postgres advisory lock serialises them. */
export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`select pg_advisory_lock(hashtext('patrika:migrations'))`);
    await migrate(db, { migrationsFolder });
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('patrika:migrations'))`).catch(() => {});
    client.release();
  }
}

// Allow `npm run db:migrate` to run this file directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => logger.info('Migrations applied'))
    .catch((err) => {
      logger.error(err, 'Migration failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
