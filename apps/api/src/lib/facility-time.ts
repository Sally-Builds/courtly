import { FACILITY_TIME_ZONE } from '@courtly/shared';
import { DateTime } from 'luxon';

export const toFacilityTime = (instant: Date): DateTime =>
  DateTime.fromJSDate(instant, { zone: FACILITY_TIME_ZONE });

/** Start of the given calendar day (YYYY-MM-DD) in the facility time zone. */
export const facilityDayStart = (date: string): DateTime =>
  DateTime.fromISO(date, { zone: FACILITY_TIME_ZONE }).startOf('day');

/** [start, end) of a facility calendar day as UTC instants. Days can be 23h/25h around DST changes. */
export function facilityDayBounds(date: string): { start: Date; end: Date } {
  const start = facilityDayStart(date);
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

export const facilityDateOf = (instant: Date): string => toFacilityTime(instant).toISODate()!;
