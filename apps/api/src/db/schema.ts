import { BOOKING_STATUSES, ROLES, SPORTS } from '@courtly/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ROLES);
export const sportEnum = pgEnum('sport', SPORTS);
export const bookingStatusEnum = pgEnum('booking_status', BOOKING_STATUSES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('user'),
  ...timestamps,
});

export const courts = pgTable(
  'courts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    sport: sportEnum('sport').notNull(),
    hourlyPriceCents: integer('hourly_price_cents').notNull(),
    // Whole hours in the facility time zone; slots are 1h, so 08:30 isn't representable on purpose.
    openingHour: smallint('opening_hour').notNull(),
    closingHour: smallint('closing_hour').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('courts_price_positive', sql`${t.hourlyPriceCents} > 0`),
    check(
      'courts_opening_hours_valid',
      sql`${t.openingHour} >= 0 AND ${t.closingHour} <= 24 AND ${t.openingHour} < ${t.closingHour}`,
    ),
  ],
);

/**
 * Overlap protection is NOT declared here: drizzle-kit can't express exclusion constraints, so
 * `bookings_no_overlap` lives in the hand-written migration drizzle/0001_booking_no_overlap.sql.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courtId: uuid('court_id')
      .notNull()
      .references(() => courts.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // Snapshot of the price at booking time, so editing a court's price doesn't rewrite history.
    priceCents: integer('price_cents').notNull(),
    status: bookingStatusEnum('status').notNull().default('confirmed'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('bookings_duration_valid', sql`${t.endsAt} - ${t.startsAt} IN (interval '1 hour', interval '2 hours')`),
    // Time-zone independent (epoch seconds); valid because the facility zone has a whole-hour offset.
    check('bookings_starts_on_the_hour', sql`extract(epoch from ${t.startsAt}) % 3600 = 0`),
    check('bookings_price_non_negative', sql`${t.priceCents} >= 0`),
    check(
      'bookings_cancelled_at_matches_status',
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} IS NOT NULL)`,
    ),
    index('bookings_starts_at_idx').on(t.startsAt),
    index('bookings_user_starts_at_idx').on(t.userId, t.startsAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CourtRow = typeof courts.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;
