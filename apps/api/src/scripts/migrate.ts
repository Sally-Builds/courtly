import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

/**
 * On a brand-new volume Postgres restarts once after initialising, so a healthcheck can pass a moment
 * before the server accepts connections. Retry briefly instead of failing the whole stack.
 */
async function waitForDatabase(db: Db, attempts = 30): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.log(`[migrate] database not ready yet (attempt ${attempt}/${attempts}), retrying…`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const { db, pool } = createDb(url);
try {
  await waitForDatabase(db);
  await runMigrations(db);
  console.log('[migrate] migrations applied');
} finally {
  await pool.end();
}
