import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, lisbon } from './helpers.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const availability = (auth: string, courtId: string, date: string) =>
  request(ctx.app).get(`/api/courts/${courtId}/availability`).query({ date }).set('Authorization', auth);

describe('GET /api/courts/:id/availability', () => {
  it("returns one slot per opening hour, marking booked and past hours", async () => {
    const court = await ctx.createCourt({ openingHour: 8, closingHour: 12 });
    const { auth } = await ctx.createUser();
    await request(ctx.app)
      .post('/api/bookings')
      .set('Authorization', auth)
      .send({ courtId: court.id, startsAt: lisbon('2030-06-10T10:00').toISOString(), durationHours: 2 })
      .expect(201);

    const res = await availability(auth, court.id, '2030-06-10'); // clock: 09:00
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s: { hour: number; state: string }) => [s.hour, s.state])).toEqual([
      [8, 'past'],
      [9, 'past'],
      [10, 'booked'],
      [11, 'booked'],
    ]);
  });

  it('respects each court\'s own opening hours', async () => {
    const court = await ctx.createCourt({ openingHour: 18, closingHour: 21 });
    const { auth } = await ctx.createUser();

    const res = await availability(auth, court.id, '2030-06-11');
    expect(res.body.slots.map((s: { hour: number }) => s.hour)).toEqual([18, 19, 20]);
  });

  it('does not count cancelled bookings or bookings on other courts', async () => {
    const court = await ctx.createCourt();
    const other = await ctx.createCourt();
    const { auth } = await ctx.createUser();
    const send = (courtId: string, local: string) =>
      request(ctx.app)
        .post('/api/bookings')
        .set('Authorization', auth)
        .send({ courtId, startsAt: lisbon(local).toISOString(), durationHours: 1 });

    const cancelled = await send(court.id, '2030-06-11T10:00');
    await request(ctx.app).post(`/api/bookings/${cancelled.body.id}/cancel`).set('Authorization', auth).expect(200);
    await send(other.id, '2030-06-11T11:00').expect(201);

    const res = await availability(auth, court.id, '2030-06-11');
    expect(res.body.slots.every((s: { state: string }) => s.state === 'available')).toBe(true);
  });

  it('rejects an invalid date', async () => {
    const court = await ctx.createCourt();
    const { auth } = await ctx.createUser();
    const res = await availability(auth, court.id, '2030-13-45');
    expect(res.status).toBe(400);
  });

  it('rejects an inactive court', async () => {
    const court = await ctx.createCourt({ isActive: false });
    const { auth } = await ctx.createUser();
    const res = await availability(auth, court.id, '2030-06-11');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COURT_INACTIVE');
  });
});
