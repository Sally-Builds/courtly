import { Link } from 'react-router';
import { useCourts } from '../api/hooks';
import { Card, EmptyState, ErrorMessage, Loading, PageHeader } from '../components/ui';
import { formatHour, formatMoney, sportLabel } from '../lib/format';

export function CourtsPage() {
  const { data: courts, isPending, error } = useCourts();

  return (
    <>
      <PageHeader title="Book a court" subtitle="Pick a court to see its availability." />
      {isPending && <Loading />}
      <ErrorMessage error={error} />
      {courts?.length === 0 && <EmptyState>No courts are open for booking right now.</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courts?.map((court) => (
          <Link key={court.id} to={`/courts/${court.id}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md group-hover:ring-emerald-300">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">{sportLabel[court.sport]}</p>
              <h2 className="mt-1 text-lg font-semibold">{court.name}</h2>
              <dl className="mt-4 space-y-1 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Open</dt>
                  <dd>
                    {formatHour(court.openingHour)}–{formatHour(court.closingHour)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Price</dt>
                  <dd>{formatMoney(court.hourlyPriceCents)} / hour</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm font-medium text-emerald-700 group-hover:underline">See availability →</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
