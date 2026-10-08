import type { Booking } from '@courtly/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCancelBooking, useMyBookings } from '../api/hooks';
import { Badge, Button, Card, EmptyState, ErrorMessage, Loading, PageHeader } from '../components/ui';
import { canStillCancel, formatDate, formatMoney, formatTimeRange, sportLabel } from '../lib/format';

export function MyBookingsPage() {
  const { data, isPending, error } = useMyBookings();

  return (
    <>
      <PageHeader title="My bookings" subtitle="Times are shown in Lisbon time." />
      {isPending && <Loading />}
      <ErrorMessage error={error} />
      {data && (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming</h2>
            {data.upcoming.length === 0 ? (
              <EmptyState>
                No upcoming bookings. <Link to="/" className="font-medium text-emerald-700 underline">Book a court</Link>
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {data.upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} cancellable />
                ))}
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Past</h2>
            {data.past.length === 0 ? (
              <EmptyState>No past bookings yet.</EmptyState>
            ) : (
              <div className="space-y-3">
                {data.past.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function BookingRow({ booking, cancellable = false }: { booking: Booking; cancellable?: boolean }) {
  const cancel = useCancelBooking();
  const [now] = useState(() => new Date());
  const isCancelled = booking.status === 'cancelled';
  const windowOpen = canStillCancel(booking.startsAt, now);

  function onCancel() {
    if (window.confirm(`Cancel your booking at ${booking.courtName}?`)) cancel.mutate(booking.id);
  }

  return (
    <Card className={isCancelled ? 'opacity-70' : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{booking.courtName}</h3>
            <Badge>{sportLabel[booking.sport]}</Badge>
            {isCancelled ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Confirmed</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatDate(booking.startsAt)} · {formatTimeRange(booking.startsAt, booking.endsAt)} · {formatMoney(booking.priceCents)}
          </p>
        </div>
        {cancellable && !isCancelled && (
          <div className="text-right">
            <Button variant="danger" onClick={onCancel} disabled={cancel.isPending || !windowOpen}>
              {cancel.isPending ? 'Cancelling…' : 'Cancel'}
            </Button>
            {!windowOpen && <p className="mt-1 text-xs text-slate-500">Cancellation closes 2h before start</p>}
          </div>
        )}
      </div>
      {cancel.error && (
        <div className="mt-3">
          <ErrorMessage error={cancel.error} />
        </div>
      )}
    </Card>
  );
}
