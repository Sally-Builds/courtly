import type { Booking, CreateBookingBody, MyBookings } from '@courtly/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { bookings, courts, type BookingRow, type CourtRow } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { PG_EXCLUSION_VIOLATION, isPgError } from '../../lib/pg-errors.js';
import { assertBookable, assertCancellable } from './booking-rules.js';

const HOUR_MS = 60 * 60 * 1000;

export const toBookingDto = (row: BookingRow, court: Pick<CourtRow, 'name' | 'sport'>): Booking => ({
  id: row.id,
  courtId: row.courtId,
  courtName: court.name,
  sport: court.sport,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  durationHours: (row.endsAt.getTime() - row.startsAt.getTime()) / HOUR_MS,
  priceCents: row.priceCents,
  status: row.status,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function createBooking(
  db: Db,
  input: { userId: string; body: CreateBookingBody; now: Date },
): Promise<Booking> {
  const { userId, body, now } = input;

  return db.transaction(async (tx) => {
    // FOR SHARE: concurrent bookings on this court can proceed in parallel, but an admin
    // deactivating it / changing its hours has to wait until this booking commits (and vice versa),
    // so we never insert against stale court rules.
    const [court] = await tx.select().from(courts).where(eq(courts.id, body.courtId)).for('share');
    if (!court) throw notFound('Court');

    const booking = assertBookable({
      court,
      startsAt: new Date(body.startsAt),
      durationHours: body.durationHours,
      now,
    });

    try {
      const [row] = await tx
        .insert(bookings)
        .values({ courtId: court.id, userId, ...booking })
        .returning();
      return toBookingDto(row!, court);
    } catch (err) {
      // The exclusion constraint is what actually prevents double booking, including two
      // requests arriving at the same instant.
      if (isPgError(err, PG_EXCLUSION_VIOLATION, 'bookings_no_overlap')) {
        throw new AppError(409, 'SLOT_TAKEN', 'That time slot has just been booked by someone else');
      }
      throw err;
    }
  });
}

export async function listMyBookings(db: Db, userId: string, now: Date): Promise<MyBookings> {
  const rows = await db
    .select({ booking: bookings, court: { name: courts.name, sport: courts.sport } })
    .from(bookings)
    .innerJoin(courts, eq(courts.id, bookings.courtId))
    .where(eq(bookings.userId, userId))
    .orderBy(asc(bookings.startsAt));

  const all = rows.map((r) => toBookingDto(r.booking, r.court));
  // A booking stays "upcoming" until it has finished.
  const isUpcoming = (b: Booking) => new Date(b.endsAt) > now;
  return {
    upcoming: all.filter(isUpcoming),
    past: all.filter((b) => !isUpcoming(b)).reverse(),
  };
}

export async function cancelBooking(
  db: Db,
  input: { bookingId: string; userId: string; now: Date },
): Promise<Booking> {
  const { bookingId, userId, now } = input;

  return db.transaction(async (tx) => {
    // Row lock so two concurrent cancels of the same booking are serialised.
    const [found] = await tx
      .select({ booking: bookings, court: { name: courts.name, sport: courts.sport } })
      .from(bookings)
      .innerJoin(courts, eq(courts.id, bookings.courtId))
      .where(eq(bookings.id, bookingId))
      .for('update', { of: bookings });
    if (!found) throw notFound('Booking');

    if (found.booking.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own bookings');
    }
    assertCancellable(found.booking, now);

    const [row] = await tx
      .update(bookings)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(eq(bookings.id, bookingId))
      .returning();
    return toBookingDto(row!, found.court);
  });
}
