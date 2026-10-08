import { CANCELLATION_CUTOFF_HOURS, type BookingStatus, type Slot } from '@courtly/shared';
import { AppError } from '../../lib/errors.js';
import { facilityDayStart, toFacilityTime } from '../../lib/facility-time.js';

// Pure business rules: no I/O, "now" is always passed in. Unit-tested in test/unit.

const HOUR_MS = 60 * 60 * 1000;

export interface CourtRules {
  isActive: boolean;
  openingHour: number;
  closingHour: number;
  hourlyPriceCents: number;
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

const overlaps = (a: TimeRange, b: TimeRange) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * One slot per opening hour of the given facility day. A slot is "booked" if any confirmed booking
 * overlaps it, otherwise "past" if it has already started, otherwise "available".
 */
export function buildDaySlots(
  court: Pick<CourtRules, 'openingHour' | 'closingHour'>,
  date: string,
  confirmedBookings: TimeRange[],
  now: Date,
): Slot[] {
  const day = facilityDayStart(date);
  const slots: Slot[] = [];

  for (let hour = court.openingHour; hour < court.closingHour; hour++) {
    const start = day.set({ hour });
    // A local hour that doesn't exist (DST spring-forward gap) is skipped rather than shifted.
    if (start.hour !== hour) continue;

    const range = { startsAt: start.toJSDate(), endsAt: start.plus({ hours: 1 }).toJSDate() };
    const state = confirmedBookings.some((b) => overlaps(b, range))
      ? 'booked'
      : range.startsAt <= now
        ? 'past'
        : 'available';

    slots.push({
      hour,
      startsAt: range.startsAt.toISOString(),
      endsAt: range.endsAt.toISOString(),
      state,
    });
  }
  return slots;
}

/**
 * Validates everything about a new booking that doesn't depend on other bookings.
 * Overlap with other bookings is deliberately NOT checked here: the database's exclusion
 * constraint is the single source of truth for that (see drizzle/0001_booking_no_overlap.sql).
 */
export function assertBookable(input: {
  court: CourtRules;
  startsAt: Date;
  durationHours: number;
  now: Date;
}): TimeRange & { priceCents: number } {
  const { court, startsAt, durationHours, now } = input;

  if (!court.isActive) {
    throw new AppError(422, 'COURT_INACTIVE', 'This court is not currently accepting bookings');
  }

  const local = toFacilityTime(startsAt);
  if (local.minute !== 0 || local.second !== 0 || local.millisecond !== 0) {
    throw new AppError(422, 'NOT_ON_THE_HOUR', 'Bookings must start on the hour');
  }

  if (startsAt <= now) {
    throw new AppError(422, 'BOOKING_IN_PAST', 'Bookings cannot be made in the past');
  }

  if (local.hour < court.openingHour || local.hour + durationHours > court.closingHour) {
    throw new AppError(
      422,
      'OUTSIDE_OPENING_HOURS',
      `Booking must be within opening hours (${formatHour(court.openingHour)}–${formatHour(court.closingHour)})`,
      { openingHour: court.openingHour, closingHour: court.closingHour },
    );
  }

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationHours * HOUR_MS),
    priceCents: court.hourlyPriceCents * durationHours,
  };
}

/** Latest instant at which a booking starting at `startsAt` may still be cancelled. */
export const cancellationDeadline = (startsAt: Date): Date =>
  new Date(startsAt.getTime() - CANCELLATION_CUTOFF_HOURS * HOUR_MS);

export function assertCancellable(booking: { startsAt: Date; status: BookingStatus }, now: Date): void {
  if (booking.status === 'cancelled') {
    throw new AppError(409, 'ALREADY_CANCELLED', 'This booking is already cancelled');
  }
  const deadline = cancellationDeadline(booking.startsAt);
  if (now > deadline) {
    throw new AppError(
      422,
      'CANCELLATION_WINDOW_CLOSED',
      `Bookings can only be cancelled up to ${CANCELLATION_CUTOFF_HOURS} hours before they start`,
      { cancellableUntil: deadline.toISOString() },
    );
  }
}

const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;
