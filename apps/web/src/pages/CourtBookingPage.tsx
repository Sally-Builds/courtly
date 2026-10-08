import { BOOKING_DURATIONS_HOURS, type Booking, type BookingDurationHours } from '@courtly/shared';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAvailability, useCreateBooking } from '../api/hooks';
import { SlotGrid, canStartAt } from '../components/SlotGrid';
import { Button, Card, DateNav, ErrorMessage, Loading, Notice, PageHeader, cx } from '../components/ui';
import { facilityDate, formatDate, formatHour, formatMoney, formatTimeRange, sportLabel } from '../lib/format';

export function CourtBookingPage() {
  const { courtId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const today = facilityDate();
  const date = params.get('date') ?? today;

  const [duration, setDuration] = useState<BookingDurationHours>(1);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const availability = useAvailability(courtId, date);
  const createBooking = useCreateBooking();

  const slots = availability.data?.slots ?? [];
  const court = availability.data?.court;
  const selectedSlot = slots.find((s) => s.hour === selectedHour);
  // If the grid refreshed underneath us (e.g. after a 409), drop a selection that's no longer valid.
  const selectionValid = selectedHour !== null && canStartAt(slots, selectedHour, duration);

  function changeDate(next: string) {
    setParams({ date: next }, { replace: true });
    setSelectedHour(null);
    createBooking.reset();
  }

  function changeDuration(next: BookingDurationHours) {
    setDuration(next);
    if (selectedHour !== null && !canStartAt(slots, selectedHour, next)) setSelectedHour(null);
  }

  function book() {
    if (!selectedSlot || !selectionValid) return;
    setConfirmed(null);
    createBooking.mutate(
      { courtId, startsAt: selectedSlot.startsAt, durationHours: duration },
      {
        onSuccess: (booking) => {
          setConfirmed(booking);
          setSelectedHour(null);
        },
      },
    );
  }

  return (
    <>
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← All courts
      </Link>
      <PageHeader
        title={court?.name ?? 'Court'}
        subtitle={
          court && (
            <>
              {sportLabel[court.sport]} · {formatHour(court.openingHour)}–{formatHour(court.closingHour)} ·{' '}
              {formatMoney(court.hourlyPriceCents)} / hour · times in Lisbon time
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <DateNav date={date} onChange={changeDate} minDate={today} />
            <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Duration">
              {BOOKING_DURATIONS_HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={duration === h}
                  onClick={() => changeDuration(h)}
                  className={cx(
                    'rounded-md px-3 py-1.5 text-sm font-medium',
                    duration === h ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {h} hour{h > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          {availability.isPending && <Loading label="Loading availability…" />}
          <ErrorMessage error={availability.error} />
          {availability.data && (
            <SlotGrid
              slots={slots}
              durationHours={duration}
              selectedHour={selectionValid ? selectedHour : null}
              onSelect={(h) => {
                setSelectedHour(h === selectedHour ? null : h);
                setConfirmed(null);
                createBooking.reset();
              }}
            />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">Your booking</h2>
            {selectedSlot && selectionValid && court ? (
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Date" value={formatDate(selectedSlot.startsAt)} />
                <Row
                  label="Time"
                  value={formatTimeRange(
                    selectedSlot.startsAt,
                    new Date(new Date(selectedSlot.startsAt).getTime() + duration * 3_600_000).toISOString(),
                  )}
                />
                <Row label="Total" value={formatMoney(court.hourlyPriceCents * duration)} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Select a start time to continue.</p>
            )}
            <Button className="mt-4 w-full" disabled={!selectionValid || createBooking.isPending} onClick={book}>
              {createBooking.isPending ? 'Booking…' : 'Confirm booking'}
            </Button>
            <p className="mt-3 text-xs text-slate-500">Free cancellation up to 2 hours before the start.</p>
          </Card>
          <ErrorMessage error={createBooking.error} />
          {confirmed && (
            <Notice>
              Booked {confirmed.courtName}, {formatDate(confirmed.startsAt)} {formatTimeRange(confirmed.startsAt, confirmed.endsAt)}.{' '}
              <Link to="/bookings" className="font-medium underline">
                View my bookings
              </Link>
            </Notice>
          )}
        </div>
      </div>
    </>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-slate-500">{label}</dt>
    <dd className="text-right font-medium">{value}</dd>
  </div>
);
