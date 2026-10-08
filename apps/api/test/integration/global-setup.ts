import { createDb } from '../../src/db/client.js';
import { ensureDatabase } from '../../src/db/ensure-database.js';
import { runMigrations } from '../../src/db/migrations.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

/** Creates the test database if needed and applies the real migrations (incl. the exclusion constraint). */
export default async function setup() {
  await ensureDatabase(TEST_DATABASE_URL);
  const { db, pool } = createDb(TEST_DATABASE_URL);
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
