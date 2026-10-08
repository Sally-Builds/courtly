import type { Slot } from '@courtly/shared';
import { formatHour } from '../lib/format';
import { cx } from './ui';

interface Props {
  slots: Slot[];
  durationHours: number;
  selectedHour: number | null;
  onSelect: (hour: number) => void;
}

/**
 * A slot can be chosen as a start hour only if it and the following (durationHours - 1) slots are
 * all available. This is a convenience; the API re-validates everything and has the final word.
 */
export function canStartAt(slots: Slot[], hour: number, durationHours: number): boolean {
  for (let h = hour; h < hour + durationHours; h++) {
    if (slots.find((s) => s.hour === h)?.state !== 'available') return false;
  }
  return true;
}

const stateLabel: Record<Slot['state'], string> = { available: 'Available', booked: 'Booked', past: 'Past' };

export function SlotGrid({ slots, durationHours, selectedHour, onSelect }: Props) {
  const isSelected = (hour: number) => selectedHour !== null && hour >= selectedHour && hour < selectedHour + durationHours;

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" aria-label="Time slots">
        {slots.map((slot) => {
          const selectable = canStartAt(slots, slot.hour, durationHours);
          const selected = isSelected(slot.hour);
          return (
            <li key={slot.hour}>
              <button
                type="button"
                disabled={!selectable && !selected}
                aria-pressed={selected}
                aria-label={`${formatHour(slot.hour)} ${stateLabel[slot.state]}`}
                onClick={() => onSelect(slot.hour)}
                className={cx(
                  'flex w-full flex-col items-center rounded-lg px-2 py-2.5 text-sm ring-1 transition-colors',
                  selected && 'bg-emerald-600 text-white ring-emerald-600',
                  !selected && slot.state === 'available' && selectable && 'bg-white ring-slate-300 hover:bg-emerald-50 hover:ring-emerald-400',
                  !selected && slot.state === 'available' && !selectable && 'cursor-not-allowed bg-white text-slate-400 ring-slate-200',
                  !selected && slot.state === 'booked' && 'cursor-not-allowed bg-rose-50 text-rose-400 ring-rose-100 line-through',
                  !selected && slot.state === 'past' && 'cursor-not-allowed bg-slate-100 text-slate-400 ring-slate-200',
                )}
              >
                <span className="font-medium">{formatHour(slot.hour)}</span>
                <span className="text-xs opacity-80">{selected ? 'Selected' : stateLabel[slot.state]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
        <Legend className="bg-white ring-slate-300" label="Available" />
        <Legend className="bg-rose-50 ring-rose-100" label="Booked" />
        <Legend className="bg-slate-100 ring-slate-200" label="Past" />
        <Legend className="bg-emerald-600 ring-emerald-600" label="Your selection" />
      </div>
    </div>
  );
}

const Legend = ({ className, label }: { className: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={cx('h-3 w-3 rounded ring-1', className)} />
    {label}
  </span>
);
