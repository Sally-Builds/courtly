import { createDb } from '../db/client.js';
import { bookings, courts, users } from '../db/schema.js';
import { facilityDayStart, facilityDateOf } from '../lib/facility-time.js';
import { hashPassword } from '../modules/auth/auth.service.js';

/**
 * Idempotent demo seed. Bookings are placed relative to *today* (facility time zone) so the
 * project shows upcoming and past bookings whenever it is started, not just on the day it was written.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, pool } = createDb(url);

try {
  const alreadySeeded = await db.select({ id: users.id }).from(users).limit(1);
  if (alreadySeeded.length > 0) {
    console.log('[seed] users already exist, skipping');
  } else {
    await seed();
    console.log('[seed] demo data inserted');
  }
} finally {
  await pool.end();
}

async function seed() {
  const today = facilityDayStart(facilityDateOf(new Date()));
  const at = (dayOffset: number, hour: number) => today.plus({ days: dayOffset }).set({ hour }).toJSDate();
  const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

  await db.transaction(async (tx) => {
    const [admin, alice, bob] = await tx
      .insert(users)
      .values([
        { email: 'admin@courtly.test', name: 'Ada Admin', role: 'admin', passwordHash: await hashPassword('admin123') },
        { email: 'alice@courtly.test', name: 'Alice Martins', role: 'user', passwordHash: await hashPassword('password123') },
        { email: 'bob@courtly.test', name: 'Bob Silva', role: 'user', passwordHash: await hashPassword('password123') },
      ])
      .returning();

    const [padel1, padel2, tennis, squash] = await tx
      .insert(courts)
      .values([
        { name: 'Padel Court 1', sport: 'padel', hourlyPriceCents: 2400, openingHour: 8, closingHour: 23 },
        { name: 'Padel Court 2', sport: 'padel', hourlyPriceCents: 2400, openingHour: 8, closingHour: 23 },
        { name: 'Tennis Court A', sport: 'tennis', hourlyPriceCents: 1800, openingHour: 7, closingHour: 22 },
        // Deactivated court that still has booking history.
        { name: 'Squash Court', sport: 'squash', hourlyPriceCents: 1200, openingHour: 9, closingHour: 21, isActive: false },
      ])
      .returning();

    if (!admin || !alice || !bob || !padel1 || !padel2 || !tennis || !squash) throw new Error('seed insert failed');

    const booking = (
      user: typeof alice,
      court: typeof padel1,
      startsAt: Date,
      hours: 1 | 2,
      cancelled = false,
    ) => ({
      userId: user.id,
      courtId: court.id,
      startsAt,
      endsAt: plusHours(startsAt, hours),
      priceCents: court.hourlyPriceCents * hours,
      ...(cancelled ? { status: 'cancelled' as const, cancelledAt: plusHours(startsAt, -24) } : {}),
    });

    await tx.insert(bookings).values([
      // Past
      booking(bob, squash, at(-7, 18), 1),
      booking(alice, padel1, at(-1, 18), 2),
      booking(bob, tennis, at(-1, 20), 1),
      // Today (admin day view)
      booking(alice, padel1, at(0, 9), 1),
      booking(bob, padel2, at(0, 17), 2),
      booking(alice, tennis, at(0, 21), 1),
      // Upcoming
      booking(alice, padel1, at(1, 10), 1),
      booking(bob, padel2, at(1, 10), 1),
      booking(alice, padel2, at(1, 12), 2, true),
      booking(alice, tennis, at(2, 19), 2),
      booking(bob, padel1, at(3, 18), 2),
    ]);
  });
}
