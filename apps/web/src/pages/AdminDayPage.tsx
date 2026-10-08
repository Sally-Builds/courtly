import { useSearchParams } from 'react-router';
import { useAdminDay } from '../api/hooks';
import { Badge, Card, DateNav, EmptyState, ErrorMessage, Loading, PageHeader } from '../components/ui';
import { facilityDate, formatMoney, formatTimeRange } from '../lib/format';

export function AdminDayPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? facilityDate();
  const { data, isPending, error } = useAdminDay(date);

  return (
    <>
      <PageHeader title="Day view" subtitle="All bookings across all courts. Times in Lisbon time." />
      <div className="mb-6">
        <DateNav date={date} onChange={(d) => setParams({ date: d }, { replace: true })} />
      </div>

      {isPending && <Loading />}
      <ErrorMessage error={error} />
      {data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Expected revenue" value={formatMoney(data.totalRevenueCents)} hint="Confirmed bookings only" />
            <Stat label="Confirmed bookings" value={String(data.confirmedCount)} />
            <Stat label="Cancelled" value={String(data.bookings.length - data.confirmedCount)} />
          </div>

          {data.bookings.length === 0 ? (
            <EmptyState>No bookings on this day.</EmptyState>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium">Court</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bookings.map((b) => (
                    <tr key={b.id} className={b.status === 'cancelled' ? 'text-slate-400' : undefined}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium">{formatTimeRange(b.startsAt, b.endsAt)}</td>
                      <td className="px-5 py-3">{b.courtName}</td>
                      <td className="px-5 py-3">
                        <div>{b.user.name}</div>
                        <div className="text-xs text-slate-500">{b.user.email}</div>
                      </td>
                      <td className="px-5 py-3">
                        {b.status === 'cancelled' ? <Badge tone="red">Cancelled</Badge> : <Badge tone="green">Confirmed</Badge>}
                      </td>
                      <td className={`px-5 py-3 text-right ${b.status === 'cancelled' ? 'line-through' : ''}`}>
                        {formatMoney(b.priceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}
