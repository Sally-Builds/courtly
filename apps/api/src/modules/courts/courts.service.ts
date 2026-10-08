import type { Availability, Court, CreateCourtInput, UpdateCourtBody } from '@courtly/shared';
import { FACILITY_TIME_ZONE } from '@courtly/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { bookings, courts, type CourtRow } from '../../db/schema.js';
import { AppError, notFound } from '../../lib/errors.js';
import { facilityDayBounds } from '../../lib/facility-time.js';
import { PG_UNIQUE_VIOLATION, isPgError } from '../../lib/pg-errors.js';
import { buildDaySlots } from '../bookings/booking-rules.js';

export const toCourtDto = (row: CourtRow): Court => ({
  id: row.id,
  name: row.name,
  sport: row.sport,
  hourlyPriceCents: row.hourlyPriceCents,
  openingHour: row.openingHour,
  closingHour: row.closingHour,
  isActive: row.isActive,
});

const nameTaken = () => new AppError(409, 'COURT_NAME_TAKEN', 'A court with this name already exists');

export async function listCourts(db: Db, opts: { includeInactive: boolean }): Promise<Court[]> {
  const rows = await db
    .select()
    .from(courts)
    .where(opts.includeInactive ? undefined : eq(courts.isActive, true))
    .orderBy(asc(courts.name));
  return rows.map(toCourtDto);
}

export async function getCourt(db: Db, id: string): Promise<Court> {
  const [row] = await db.select().from(courts).where(eq(courts.id, id));
  if (!row) throw notFound('Court');
  return toCourtDto(row);
}

export async function createCourt(db: Db, values: CreateCourtInput): Promise<Court> {
  try {
    const [row] = await db.insert(courts).values(values).returning();
    return toCourtDto(row!);
  } catch (err) {
    if (isPgError(err, PG_UNIQUE_VIOLATION, 'courts_name_unique')) throw nameTaken();
    throw err;
  }
}

/**
 * Partial update. Existing bookings are intentionally left untouched when a court is deactivated
 * or its hours change: deactivation only stops new bookings, and history is never rewritten.
 */
export async function updateCourt(db: Db, id: string, patch: UpdateCourtBody): Promise<Court> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(courts).where(eq(courts.id, id)).for('update');
    if (!current) throw notFound('Court');

    const openingHour = patch.openingHour ?? current.openingHour;
    const closingHour = patch.closingHour ?? current.closingHour;
    if (openingHour >= closingHour) {
      throw new AppError(400, 'VALIDATION_ERROR', 'openingHour must be before closingHour', [
        { path: 'closingHour', message: 'openingHour must be before closingHour' },
      ]);
    }

    try {
      const [row] = await tx
        .update(courts)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(courts.id, id))
        .returning();
      return toCourtDto(row!);
    } catch (err) {
      if (isPgError(err, PG_UNIQUE_VIOLATION, 'courts_name_unique')) throw nameTaken();
      throw err;
    }
  });
}

export async function getAvailability(db: Db, courtId: string, date: string, now: Date): Promise<Availability> {
  const court = await getCourt(db, courtId);
  if (!court.isActive) {
    throw new AppError(422, 'COURT_INACTIVE', 'This court is not currently accepting bookings');
  }

  const day = facilityDayBounds(date);
  const taken = await confirmedBookingsOverlapping(db, courtId, day.start, day.end);
  return {
    court,
    date,
    timeZone: FACILITY_TIME_ZONE,
    slots: buildDaySlots(court, date, taken, now),
  };
}

/**
 * Confirmed bookings on a court overlapping [start, end). Uses the same range expression and
 * predicate as the exclusion constraint, so the constraint's GiST index serves this query.
 */
export const confirmedBookingsOverlapping = (db: Db, courtId: string, start: Date, end: Date) =>
  db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, courtId),
        eq(bookings.status, 'confirmed'),
        sql`tstzrange(${bookings.startsAt}, ${bookings.endsAt}, '[)') && tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')`,
      ),
    );
