import { z } from 'zod';
import { BOOKING_DURATIONS_HOURS, SPORTS } from './constants.js';

export const loginBodySchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

const hour = z.number().int().min(0).max(24);

const courtFields = z.object({
  name: z.string().trim().min(1).max(80),
  sport: z.enum(SPORTS),
  hourlyPriceCents: z.number().int().positive().max(1_000_000),
  openingHour: hour,
  closingHour: hour,
  isActive: z.boolean(),
});

const openBeforeClose = (c: { openingHour?: number; closingHour?: number }) =>
  c.openingHour === undefined || c.closingHour === undefined || c.openingHour < c.closingHour;
const openBeforeCloseIssue = {
  message: 'openingHour must be before closingHour',
  path: ['closingHour'],
};

export const createCourtBodySchema = courtFields
  .extend({ isActive: z.boolean().default(true) })
  .refine(openBeforeClose, openBeforeCloseIssue);
export type CreateCourtBody = z.input<typeof createCourtBodySchema>;

/** Partial update; when only one of the hours is sent, the service checks it against the stored value. */
export const updateCourtBodySchema = courtFields
  .partial()
  .refine(openBeforeClose, openBeforeCloseIssue)
  .refine((c) => Object.keys(c).length > 0, { message: 'At least one field is required' });
export type UpdateCourtBody = z.infer<typeof updateCourtBodySchema>;

export const courtListQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Calendar date (YYYY-MM-DD), interpreted in the facility time zone. */
export const dateQuerySchema = z.object({
  date: z.iso.date(),
});
export type DateQuery = z.infer<typeof dateQuerySchema>;

export const createBookingBodySchema = z.object({
  courtId: z.uuid(),
  /** ISO-8601 instant with offset, e.g. "2026-10-12T18:00:00+01:00" or "...Z". */
  startsAt: z.iso.datetime({ offset: true }),
  durationHours: z.literal(BOOKING_DURATIONS_HOURS),
});
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;

export const idParamSchema = z.object({ id: z.uuid() });
