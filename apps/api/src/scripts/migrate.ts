import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const { db, pool } = createDb(url);
try {
  await runMigrations(db);
  console.log('[migrate] migrations applied');
} finally {
  await pool.end();
}
