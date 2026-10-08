/** All day/hour logic (opening hours, "today", admin day view) is evaluated in the facility's time zone. */
export const FACILITY_TIME_ZONE = 'Europe/Lisbon';

export const SPORTS = ['padel', 'tennis', 'squash', 'pickleball', 'badminton'] as const;
export type Sport = (typeof SPORTS)[number];

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_DURATIONS_HOURS = [1, 2] as const;
export type BookingDurationHours = (typeof BOOKING_DURATIONS_HOURS)[number];

/** A booking can be cancelled up to (and including) this many hours before it starts. */
export const CANCELLATION_CUTOFF_HOURS = 2;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'COURT_NAME_TAKEN',
  'COURT_INACTIVE',
  'SLOT_TAKEN',
  'BOOKING_IN_PAST',
  'NOT_ON_THE_HOUR',
  'OUTSIDE_OPENING_HOURS',
  'ALREADY_CANCELLED',
  'CANCELLATION_WINDOW_CLOSED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
