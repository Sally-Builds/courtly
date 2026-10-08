import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { systemClock } from './lib/clock.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = createApp({ db, clock: systemClock, jwtSecret: config.JWT_SECRET });

const server = app.listen(config.PORT, () => {
  console.log(`[api] listening on :${config.PORT}`);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
