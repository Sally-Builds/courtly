import type { BookingStatus, ErrorCode, Role, Sport } from './constants.js';

// Response DTOs. Timestamps are ISO-8601 strings in UTC; money is integer cents.

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export interface Court {
  id: string;
  name: string;
  sport: Sport;
  hourlyPriceCents: number;
  openingHour: number;
  closingHour: number;
  isActive: boolean;
}

export type SlotState = 'available' | 'booked' | 'past';

export interface Slot {
  /** Local hour in the facility time zone (e.g. 18 for 18:00–19:00). */
  hour: number;
  startsAt: string;
  endsAt: string;
  state: SlotState;
}

export interface Availability {
  court: Court;
  date: string;
  timeZone: string;
  slots: Slot[];
}

export interface Booking {
  id: string;
  courtId: string;
  courtName: string;
  sport: Sport;
  startsAt: string;
  endsAt: string;
  durationHours: number;
  priceCents: number;
  status: BookingStatus;
  cancelledAt: string | null;
  createdAt: string;
}

export interface MyBookings {
  upcoming: Booking[];
  past: Booking[];
}

export interface AdminBooking extends Booking {
  user: { id: string; name: string; email: string };
}

export interface AdminDayView {
  date: string;
  timeZone: string;
  bookings: AdminBooking[];
  confirmedCount: number;
  /** Sum of price of confirmed (non-cancelled) bookings starting that day. */
  totalRevenueCents: number;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
