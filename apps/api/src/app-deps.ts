import type { Db } from './db/client.js';
import type { Clock } from './lib/clock.js';

/** Everything the HTTP layer needs, injected so tests can swap the database and the clock. */
export interface AppDeps {
  db: Db;
  clock: Clock;
  jwtSecret: string;
}
