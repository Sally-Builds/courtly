import { CANCELLATION_CUTOFF_HOURS, FACILITY_TIME_ZONE, type Sport } from '@courtly/shared';

// All dates/times are shown in the facility's time zone, whatever the browser's zone is.

const dateKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: FACILITY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: FACILITY_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const longDateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: FACILITY_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

/** YYYY-MM-DD of an instant in the facility time zone. */
export const facilityDate = (instant: Date = new Date()) => dateKeyFormat.format(instant);

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatTimeRange = (startIso: string, endIso: string) => `${formatTime(startIso)}–${formatTime(endIso)}`;
export const formatDate = (iso: string) => longDateFormat.format(new Date(iso));
export const formatMoney = (cents: number) => money.format(cents / 100);
export const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** Formats a YYYY-MM-DD calendar date (no time zone shift: noon UTC is the same day everywhere relevant). */
export const formatCalendarDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${date}T12:00:00Z`),
  );

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UI hint only; the API is the authority on the cancellation window. */
export const canStillCancel = (startsAtIso: string, now = new Date()) =>
  now.getTime() <= new Date(startsAtIso).getTime() - CANCELLATION_CUTOFF_HOURS * 3_600_000;

export const sportLabel: Record<Sport, string> = {
  padel: 'Padel',
  tennis: 'Tennis',
  squash: 'Squash',
  pickleball: 'Pickleball',
  badminton: 'Badminton',
};
