import { SPORTS, type Court, type Sport } from '@courtly/shared';
import { useState, type FormEvent } from 'react';
import { useCourts, useSaveCourt } from '../api/hooks';
import { Badge, Button, Card, ErrorMessage, Loading, PageHeader } from '../components/ui';
import { formatHour, formatMoney, sportLabel } from '../lib/format';

export function AdminCourtsPage() {
  const { data: courts, isPending, error } = useCourts(true);
  const [editing, setEditing] = useState<Court | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Manage courts"
        subtitle="Deactivated courts can't be booked, but keep their booking history."
        actions={editing === null && <Button onClick={() => setEditing('new')}>Add court</Button>}
      />

      {editing !== null && (
        <CourtForm key={editing === 'new' ? 'new' : editing.id} court={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}

      {isPending && <Loading />}
      <ErrorMessage error={error} />
      {courts && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Court</th>
                <th className="px-5 py-3 font-medium">Hours</th>
                <th className="px-5 py-3 font-medium">Price / hour</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courts.map((court) => (
                <CourtRow key={court.id} court={court} onEdit={() => setEditing(court)} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function CourtRow({ court, onEdit }: { court: Court; onEdit: () => void }) {
  const save = useSaveCourt();
  return (
    <tr>
      <td className="px-5 py-3">
        <div className="font-medium">{court.name}</div>
        <div className="text-xs text-slate-500">{sportLabel[court.sport]}</div>
      </td>
      <td className="px-5 py-3">
        {formatHour(court.openingHour)}–{formatHour(court.closingHour)}
      </td>
      <td className="px-5 py-3">{formatMoney(court.hourlyPriceCents)}</td>
      <td className="px-5 py-3">{court.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant={court.isActive ? 'danger' : 'secondary'}
            disabled={save.isPending}
            onClick={() => save.mutate({ id: court.id, body: { isActive: !court.isActive } })}
          >
            {court.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
        {save.error && <p className="mt-1 text-right text-xs text-red-600">{save.error.message}</p>}
      </td>
    </tr>
  );
}

const inputClass = 'mt-1 w-full rounded-lg border-0 px-3 py-2 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-500';
const hours = Array.from({ length: 25 }, (_, h) => h);

function CourtForm({ court, onDone }: { court: Court | null; onDone: () => void }) {
  const save = useSaveCourt();
  const [name, setName] = useState(court?.name ?? '');
  const [sport, setSport] = useState<Sport>(court?.sport ?? 'padel');
  const [price, setPrice] = useState(court ? String(court.hourlyPriceCents / 100) : '20');
  const [openingHour, setOpeningHour] = useState(court?.openingHour ?? 8);
  const [closingHour, setClosingHour] = useState(court?.closingHour ?? 23);
  const [isActive, setIsActive] = useState(court?.isActive ?? true);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, sport, hourlyPriceCents: Math.round(Number(price) * 100), openingHour, closingHour, isActive };
    save.mutate({ id: court?.id, body }, { onSuccess: onDone });
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-4 font-semibold">{court ? `Edit ${court.name}` : 'New court'}</h2>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input className={inputClass} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Sport</span>
          <select className={inputClass} value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {sportLabel[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Price per hour (€)</span>
          <input
            className={inputClass}
            type="number"
            min="0.01"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Opens</span>
          <select className={inputClass} value={openingHour} onChange={(e) => setOpeningHour(Number(e.target.value))}>
            {hours.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Closes</span>
          <select className={inputClass} value={closingHour} onChange={(e) => setClosingHour(Number(e.target.value))}>
            {hours.slice(1).map((h) => (
              <option key={h} value={h}>
                {h === 24 ? '24:00 (midnight)' : formatHour(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span className="font-medium text-slate-700">Active (bookable)</span>
        </label>
        <div className="sm:col-span-2 lg:col-span-3">
          <ErrorMessage error={save.error} />
          <div className="mt-2 flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save court'}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
