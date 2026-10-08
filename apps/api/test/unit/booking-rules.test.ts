import { FACILITY_TIME_ZONE } from '@courtly/shared';
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import {
  assertBookable,
  assertCancellable,
  buildDaySlots,
  type CourtRules,
} from '../../src/modules/bookings/booking-rules.js';

const lisbon = (local: string) => DateTime.fromISO(local, { zone: FACILITY_TIME_ZONE }).toJSDate();
const court: CourtRules = { isActive: true, openingHour: 8, closingHour: 23, hourlyPriceCents: 2400 };
const now = lisbon('2030-06-10T09:00');

function errorCodeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe('assertBookable', () => {
  const book = (local: string, durationHours = 1, c: CourtRules = court) =>
    assertBookable({ court: c, startsAt: lisbon(local), durationHours, now });

  it('accepts a booking inside opening hours and prices it per hour', () => {
    const result = book('2030-06-11T10:00', 2);
    expect(result.endsAt).toEqual(lisbon('2030-06-11T12:00'));
    expect(result.priceCents).toBe(4800);
  });

  describe('opening hours', () => {
    it('accepts the first slot of the day', () => {
      expect(errorCodeOf(() => book('2030-06-11T08:00'))).toBeUndefined();
    });

    it('accepts a booking ending exactly at closing time', () => {
      expect(errorCodeOf(() => book('2030-06-11T21:00', 2))).toBeUndefined();
      expect(errorCodeOf(() => book('2030-06-11T22:00', 1))).toBeUndefined();
    });

    it('rejects a booking starting before opening', () => {
      expect(errorCodeOf(() => book('2030-06-11T07:00'))).toBe('OUTSIDE_OPENING_HOURS');
    });

    it('rejects a booking starting at closing time', () => {
      expect(errorCodeOf(() => book('2030-06-11T23:00'))).toBe('OUTSIDE_OPENING_HOURS');
    });

    it('rejects a 2h booking that would run past closing', () => {
      expect(errorCodeOf(() => book('2030-06-11T22:00', 2))).toBe('OUTSIDE_OPENING_HOURS');
    });

    it('supports courts open until midnight', () => {
      const lateCourt = { ...court, closingHour: 24 };
      expect(errorCodeOf(() => book('2030-06-11T23:00', 1, lateCourt))).toBeUndefined();
      expect(errorCodeOf(() => book('2030-06-11T23:00', 2, lateCourt))).toBe('OUTSIDE_OPENING_HOURS');
    });

    it('evaluates hours in the facility time zone, not UTC', () => {
      // 07:30Z in June is 08:30 Lisbon -> not on the hour; 07:00Z is 08:00 Lisbon -> opening hour.
      const at = (iso: string) => assertBookable({ court, startsAt: new Date(iso), durationHours: 1, now });
      expect(errorCodeOf(() => at('2030-06-11T07:00:00Z'))).toBeUndefined();
      expect(errorCodeOf(() => at('2030-06-11T06:00:00Z'))).toBe('OUTSIDE_OPENING_HOURS');
    });
  });

  it('rejects bookings in the past, including the slot that is starting right now', () => {
    expect(errorCodeOf(() => book('2030-06-10T08:00'))).toBe('BOOKING_IN_PAST');
    expect(errorCodeOf(() => book('2030-06-10T09:00'))).toBe('BOOKING_IN_PAST');
    expect(errorCodeOf(() => book('2030-06-10T10:00'))).toBeUndefined();
  });

  it('rejects bookings not starting on the hour', () => {
    expect(errorCodeOf(() => book('2030-06-11T10:30'))).toBe('NOT_ON_THE_HOUR');
  });

  it('rejects bookings on an inactive court', () => {
    expect(errorCodeOf(() => book('2030-06-11T10:00', 1, { ...court, isActive: false }))).toBe('COURT_INACTIVE');
  });
});

describe('assertCancellable (2-hour window)', () => {
  const startsAt = lisbon('2030-06-10T18:00');
  const cancelAt = (local: string) => errorCodeOf(() => assertCancellable({ startsAt, status: 'confirmed' }, lisbon(local)));

  it('allows cancelling well before the start', () => {
    expect(cancelAt('2030-06-10T09:00')).toBeUndefined();
  });

  it('allows cancelling exactly 2 hours before the start', () => {
    expect(cancelAt('2030-06-10T16:00')).toBeUndefined();
  });

  it('rejects cancelling less than 2 hours before the start', () => {
    expect(
      errorCodeOf(() =>
        assertCancellable({ startsAt, status: 'confirmed' }, new Date(lisbon('2030-06-10T16:00').getTime() + 1000)),
      ),
    ).toBe('CANCELLATION_WINDOW_CLOSED');
    expect(cancelAt('2030-06-10T17:00')).toBe('CANCELLATION_WINDOW_CLOSED');
  });

  it('rejects cancelling after the booking started', () => {
    expect(cancelAt('2030-06-10T18:30')).toBe('CANCELLATION_WINDOW_CLOSED');
  });

  it('rejects cancelling an already cancelled booking', () => {
    expect(errorCodeOf(() => assertCancellable({ startsAt, status: 'cancelled' }, lisbon('2030-06-10T09:00')))).toBe(
      'ALREADY_CANCELLED',
    );
  });
});

describe('buildDaySlots', () => {
  it('produces one slot per opening hour', () => {
    const slots = buildDaySlots(court, '2030-06-11', [], now);
    expect(slots.map((s) => s.hour)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(slots.every((s) => s.state === 'available')).toBe(true);
    expect(slots[0]!.startsAt).toBe('2030-06-11T07:00:00.000Z');
  });

  it('marks every hour covered by a booking as booked, including 2h bookings', () => {
    const slots = buildDaySlots(
      court,
      '2030-06-11',
      [{ startsAt: lisbon('2030-06-11T10:00'), endsAt: lisbon('2030-06-11T12:00') }],
      now,
    );
    const booked = slots.filter((s) => s.state === 'booked').map((s) => s.hour);
    expect(booked).toEqual([10, 11]);
  });

  it('marks hours that already started as past', () => {
    const slots = buildDaySlots(court, '2030-06-10', [], lisbon('2030-06-10T10:15'));
    expect(slots.filter((s) => s.state === 'past').map((s) => s.hour)).toEqual([8, 9, 10]);
    expect(slots.find((s) => s.hour === 11)!.state).toBe('available');
  });

  it('follows the DST change (Lisbon switches to UTC+0 on 25 Oct 2026)', () => {
    const before = buildDaySlots(court, '2026-10-24', [], new Date('2020-01-01'));
    const after = buildDaySlots(court, '2026-10-25', [], new Date('2020-01-01'));
    expect(before[0]!.startsAt).toBe('2026-10-24T07:00:00.000Z');
    expect(after[0]!.startsAt).toBe('2026-10-25T08:00:00.000Z');
  });

  it('skips a local hour that does not exist on the spring-forward day', () => {
    const allDay = { openingHour: 0, closingHour: 24 };
    const slots = buildDaySlots(allDay, '2026-03-29', [], new Date('2020-01-01'));
    expect(slots).toHaveLength(23);
    expect(slots.map((s) => s.hour)).not.toContain(1);
  });
});
