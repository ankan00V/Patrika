import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, pool } from './client.js';
import { logger } from '../lib/logger.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
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
