import pg from 'pg';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrations.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

/** Creates the test database if needed and applies the real migrations (incl. the exclusion constraint). */
export default async function setup() {
  const target = new URL(TEST_DATABASE_URL);
  const dbName = target.pathname.slice(1);
  const maintenance = new URL(TEST_DATABASE_URL);
  maintenance.pathname = '/postgres';

  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  const { db, pool } = createDb(TEST_DATABASE_URL);
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
