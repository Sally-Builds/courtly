import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, lisbon } from './helpers.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const book = (auth: string, courtId: string, local: string, durationHours = 1) =>
  request(ctx.app)
    .post('/api/bookings')
    .set('Authorization', auth)
    .send({ courtId, startsAt: lisbon(local).toISOString(), durationHours });

const cancel = (auth: string, id: string) =>
  request(ctx.app).post(`/api/bookings/${id}/cancel`).set('Authorization', auth);

describe('POST /api/bookings', () => {
  it('creates a booking and snapshots the price', async () => {
    const court = await ctx.createCourt({ hourlyPriceCents: 2400 });
    const { auth } = await ctx.createUser();

    const res = await book(auth, court.id, '2030-06-11T18:00', 2);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      courtId: court.id,
      startsAt: lisbon('2030-06-11T18:00').toISOString(),
      endsAt: lisbon('2030-06-11T20:00').toISOString(),
      durationHours: 2,
      priceCents: 4800,
      status: 'confirmed',
    });
  });

  it.each([
    ['before opening', '2030-06-11T07:00', 1],
    ['at closing time', '2030-06-11T23:00', 1],
    ['running past closing', '2030-06-11T22:00', 2],
  ])('rejects a booking %s with 422 OUTSIDE_OPENING_HOURS', async (_label, local, duration) => {
    const court = await ctx.createCourt({ openingHour: 8, closingHour: 23 });
    const { auth } = await ctx.createUser();

    const res = await book(auth, court.id, local, duration);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTSIDE_OPENING_HOURS');
  });

  it('rejects bookings in the past', async () => {
    const court = await ctx.createCourt();
    const { auth } = await ctx.createUser();

    const res = await book(auth, court.id, '2030-06-10T08:00'); // clock is 09:00
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BOOKING_IN_PAST');
  });

  it('rejects bookings on an inactive court', async () => {
    const court = await ctx.createCourt({ isActive: false });
    const { auth } = await ctx.createUser();

    const res = await book(auth, court.id, '2030-06-11T10:00');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COURT_INACTIVE');
  });

  it('validates the request body', async () => {
    const court = await ctx.createCourt();
    const { auth } = await ctx.createUser();

    const res = await request(ctx.app)
      .post('/api/bookings')
      .set('Authorization', auth)
      .send({ courtId: court.id, startsAt: 'tomorrow', durationHours: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['durationHours', 'startsAt']);
  });

  it('returns 404 for an unknown court', async () => {
    const { auth } = await ctx.createUser();
    const res = await book(auth, '00000000-0000-4000-8000-000000000000', '2030-06-11T10:00');
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await request(ctx.app).post('/api/bookings').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/bookings/:id/cancel (2-hour window)', () => {
  async function bookingAt(local: string) {
    const court = await ctx.createCourt();
    const owner = await ctx.createUser();
    const res = await book(owner.auth, court.id, local);
    expect(res.status).toBe(201);
    return { owner, bookingId: res.body.id as string };
  }

  it('cancels a booking more than 2 hours ahead', async () => {
    const { owner, bookingId } = await bookingAt('2030-06-10T18:00');

    const res = await cancel(owner.auth, bookingId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.cancelledAt).toBe(ctx.clock.now().toISOString());
  });

  it('allows cancelling exactly 2 hours before the start', async () => {
    const { owner, bookingId } = await bookingAt('2030-06-10T18:00');
    ctx.clock.current = lisbon('2030-06-10T16:00');

    expect((await cancel(owner.auth, bookingId)).status).toBe(200);
  });

  it('rejects cancelling within 2 hours of the start with a clear error', async () => {
    const { owner, bookingId } = await bookingAt('2030-06-10T18:00');
    ctx.clock.current = lisbon('2030-06-10T16:01');

    const res = await cancel(owner.auth, bookingId);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'CANCELLATION_WINDOW_CLOSED',
      message: 'Bookings can only be cancelled up to 2 hours before they start',
      details: { cancellableUntil: lisbon('2030-06-10T16:00').toISOString() },
    });
  });

  it("does not let a user cancel someone else's booking", async () => {
    const { bookingId } = await bookingAt('2030-06-10T18:00');
    const intruder = await ctx.createUser();

    const res = await cancel(intruder.auth, bookingId);
    expect(res.status).toBe(403);
  });

  it('rejects cancelling twice', async () => {
    const { owner, bookingId } = await bookingAt('2030-06-10T18:00');
    await cancel(owner.auth, bookingId).expect(200);

    const res = await cancel(owner.auth, bookingId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CANCELLED');
  });
});

describe('GET /api/bookings/me', () => {
  it('splits own bookings into upcoming and past, excluding other users', async () => {
    const court = await ctx.createCourt();
    const me = await ctx.createUser();
    const other = await ctx.createUser();

    ctx.clock.current = lisbon('2030-06-01T09:00');
    await book(me.auth, court.id, '2030-06-05T10:00');
    await book(me.auth, court.id, '2030-06-12T10:00');
    await book(me.auth, court.id, '2030-06-11T10:00');
    await book(other.auth, court.id, '2030-06-11T12:00');
    ctx.clock.current = lisbon('2030-06-10T09:00');

    const res = await request(ctx.app).get('/api/bookings/me').set('Authorization', me.auth).expect(200);

    expect(res.body.upcoming.map((b: { startsAt: string }) => b.startsAt)).toEqual([
      lisbon('2030-06-11T10:00').toISOString(),
      lisbon('2030-06-12T10:00').toISOString(),
    ]);
    expect(res.body.past.map((b: { startsAt: string }) => b.startsAt)).toEqual([lisbon('2030-06-05T10:00').toISOString()]);
  });
});
