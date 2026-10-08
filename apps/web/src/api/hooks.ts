import type {
  AdminDayView,
  Availability,
  Booking,
  Court,
  CreateBookingBody,
  CreateCourtBody,
  MyBookings,
  UpdateCourtBody,
} from '@courtly/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export const queryKeys = {
  courts: (includeInactive: boolean) => ['courts', { includeInactive }] as const,
  court: (id: string) => ['court', id] as const,
  availability: (courtId: string, date: string) => ['availability', courtId, date] as const,
  myBookings: ['my-bookings'] as const,
  adminDay: (date: string) => ['admin-day', date] as const,
};

export const useCourts = (includeInactive = false) =>
  useQuery({
    queryKey: queryKeys.courts(includeInactive),
    queryFn: () => api<Court[]>(`/courts${includeInactive ? '?includeInactive=true' : ''}`),
  });

export const useAvailability = (courtId: string, date: string) =>
  useQuery({
    queryKey: queryKeys.availability(courtId, date),
    queryFn: () => api<Availability>(`/courts/${courtId}/availability?date=${date}`),
  });

export const useMyBookings = () =>
  useQuery({ queryKey: queryKeys.myBookings, queryFn: () => api<MyBookings>('/bookings/me') });

export const useAdminDay = (date: string) =>
  useQuery({ queryKey: queryKeys.adminDay(date), queryFn: () => api<AdminDayView>(`/admin/bookings?date=${date}`) });

/** Any booking change can affect availability, "my bookings" and the admin view. */
function useInvalidateBookingData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['availability'] }),
      qc.invalidateQueries({ queryKey: queryKeys.myBookings }),
      qc.invalidateQueries({ queryKey: ['admin-day'] }),
    ]);
}

export function useCreateBooking() {
  const invalidate = useInvalidateBookingData();
  return useMutation({
    mutationFn: (body: CreateBookingBody) => api<Booking>('/bookings', { method: 'POST', body }),
    // Refresh on failure too: a 409 means our view of the slot grid is stale.
    onSettled: invalidate,
  });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookingData();
  return useMutation({
    mutationFn: (id: string) => api<Booking>(`/bookings/${id}/cancel`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useSaveCourt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: CreateCourtBody | UpdateCourtBody }) =>
      input.id
        ? api<Court>(`/courts/${input.id}`, { method: 'PATCH', body: input.body })
        : api<Court>('/courts', { method: 'POST', body: input.body }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['courts'] }), qc.invalidateQueries({ queryKey: ['availability'] })]),
  });
}
