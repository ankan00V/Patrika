import pg from 'pg';
import { testEnv } from '../vitest.config.js';

export default async function setup() {
  Object.assign(process.env, testEnv);
  const url = new URL(testEnv.DATABASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!rowCount) await admin.query(`create database "${dbName}"`);
  await admin.end();

  const { runMigrations } = await import('../src/db/migrate.js');
  const { pool } = await import('../src/db/client.js');
  await runMigrations();
  await pool.end();
}
