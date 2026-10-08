import { FACILITY_TIME_ZONE, type Role } from '@courtly/shared';
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db/client.js';
import { courts, users, type CourtRow } from '../../src/db/schema.js';
import type { Clock } from '../../src/lib/clock.js';
import { hashPassword, signToken } from '../../src/modules/auth/auth.service.js';
import { TEST_DATABASE_URL } from './test-db-url.js';

export const JWT_SECRET = 'test-secret-at-least-16-chars';
export const PASSWORD = 'password123';

/** Facility-local wall-clock time → UTC instant, e.g. lisbon('2030-06-11T10:00'). */
export const lisbon = (local: string): Date => DateTime.fromISO(local, { zone: FACILITY_TIME_ZONE }).toJSDate();

export class TestClock implements Clock {
  constructor(public current: Date) {}
  now() {
    return this.current;
  }
}

let counter = 0;

export function createTestContext() {
  const { db, pool } = createDb(TEST_DATABASE_URL);
  // "Now" is 09:00 Lisbon on 10 June 2030 unless a test moves it.
  const clock = new TestClock(lisbon('2030-06-10T09:00'));
  const app = createApp({ db, clock, jwtSecret: JWT_SECRET });

  return {
    db,
    pool,
    clock,
    app,

    async reset() {
      // DELETE is much faster than TRUNCATE for the handful of rows each test creates.
      await db.execute(sql`DELETE FROM bookings; DELETE FROM courts; DELETE FROM users;`);
      clock.current = lisbon('2030-06-10T09:00');
    },

    async createUser(role: Role = 'user') {
      counter++;
      const [user] = await db
        .insert(users)
        .values({
          email: `${role}${counter}@test.local`,
          name: `${role} ${counter}`,
          role,
          passwordHash: await hashPassword(PASSWORD, 4),
        })
        .returning();
      const token = signToken({ userId: user!.id, role }, JWT_SECRET);
      return { user: user!, token, auth: `Bearer ${token}` };
    },

    async createCourt(overrides: Partial<typeof courts.$inferInsert> = {}): Promise<CourtRow> {
      counter++;
      const [court] = await db
        .insert(courts)
        .values({
          name: `Court ${counter}`,
          sport: 'padel',
          hourlyPriceCents: 2000,
          openingHour: 8,
          closingHour: 23,
          ...overrides,
        })
        .returning();
      return court!;
    },

    close: () => pool.end(),
  };
}

export type TestContext = ReturnType<typeof createTestContext>;
