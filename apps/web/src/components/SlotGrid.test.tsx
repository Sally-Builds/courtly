import type { Slot, SlotState } from '@courtly/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotGrid, canStartAt } from './SlotGrid';

const slot = (hour: number, state: SlotState): Slot => ({
  hour,
  state,
  startsAt: `2030-06-11T${String(hour - 1).padStart(2, '0')}:00:00.000Z`,
  endsAt: `2030-06-11T${String(hour).padStart(2, '0')}:00:00.000Z`,
});

// 08 past, 09 available, 10 booked, 11 available, 12 available (last slot of the day)
const slots = [slot(8, 'past'), slot(9, 'available'), slot(10, 'booked'), slot(11, 'available'), slot(12, 'available')];

describe('canStartAt', () => {
  it('allows a 1h start on any available slot', () => {
    expect(canStartAt(slots, 9, 1)).toBe(true);
    expect(canStartAt(slots, 12, 1)).toBe(true);
    expect(canStartAt(slots, 10, 1)).toBe(false);
    expect(canStartAt(slots, 8, 1)).toBe(false);
  });

  it('requires the next hour to be free for a 2h booking', () => {
    expect(canStartAt(slots, 9, 2)).toBe(false); // 10 is booked
    expect(canStartAt(slots, 11, 2)).toBe(true);
  });

  it('does not allow a 2h booking starting at the last opening hour', () => {
    expect(canStartAt(slots, 12, 2)).toBe(false);
  });
});

describe('<SlotGrid />', () => {
  it('disables slots that cannot be booked and reports the chosen start hour', async () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={slots} durationHours={1} selectedHour={null} onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: '08:00 Past' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '10:00 Booked' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '11:00 Available' }));
    expect(onSelect).toHaveBeenCalledWith(11);
  });

  it('highlights both hours of a 2h selection', () => {
    render(<SlotGrid slots={slots} durationHours={2} selectedHour={11} onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: '11:00 Available' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '12:00 Available' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '09:00 Available' })).toBeDisabled();
  });
});
