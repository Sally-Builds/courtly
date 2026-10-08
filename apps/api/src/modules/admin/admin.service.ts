import type { AdminDayView } from '@courtly/shared';
import { FACILITY_TIME_ZONE } from '@courtly/shared';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { bookings, courts, users } from '../../db/schema.js';
import { facilityDayBounds } from '../../lib/facility-time.js';
import { toBookingDto } from '../bookings/bookings.service.js';

/**
 * All bookings starting on the given facility day, across all courts (active or not), including
 * cancelled ones for visibility. Expected revenue counts confirmed bookings only.
 * Bookings never cross midnight (closingHour <= 24), so "starts that day" == "happens that day".
 */
export async function getDayView(db: Db, date: string): Promise<AdminDayView> {
  const day = facilityDayBounds(date);

  const rows = await db
    .select({
      booking: bookings,
      court: { name: courts.name, sport: courts.sport },
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .innerJoin(users, eq(users.id, bookings.userId))
    .where(and(gte(bookings.startsAt, day.start), lt(bookings.startsAt, day.end)))
    .orderBy(asc(bookings.startsAt), asc(courts.name));

  const dayBookings = rows.map((r) => ({ ...toBookingDto(r.booking, r.court), user: r.user }));
  const confirmed = dayBookings.filter((b) => b.status === 'confirmed');

  return {
    date,
    timeZone: FACILITY_TIME_ZONE,
    bookings: dayBookings,
    confirmedCount: confirmed.length,
    totalRevenueCents: confirmed.reduce((sum, b) => sum + b.priceCents, 0),
  };
}
