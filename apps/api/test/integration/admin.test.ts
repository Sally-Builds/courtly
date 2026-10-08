import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, lisbon } from './helpers.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const newCourt = { name: 'Centre Court', sport: 'tennis', hourlyPriceCents: 1800, openingHour: 7, closingHour: 22 };

describe('role separation is enforced by the API', () => {
  it('rejects non-admins on admin endpoints with 403', async () => {
    const court = await ctx.createCourt();
    const { auth } = await ctx.createUser('user');

    const attempts = [
      request(ctx.app).post('/api/courts').set('Authorization', auth).send(newCourt),
      request(ctx.app).patch(`/api/courts/${court.id}`).set('Authorization', auth).send({ isActive: false }),
      request(ctx.app).get('/api/admin/bookings').query({ date: '2030-06-10' }).set('Authorization', auth),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects a forged token', async () => {
    const res = await request(ctx.app)
      .get('/api/admin/bookings')
      .query({ date: '2030-06-10' })
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });
});

describe('court management', () => {
  it('lets an admin create and edit courts', async () => {
    const { auth } = await ctx.createUser('admin');

    const created = await request(ctx.app).post('/api/courts').set('Authorization', auth).send(newCourt);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...newCourt, isActive: true });

    const updated = await request(ctx.app)
      .patch(`/api/courts/${created.body.id}`)
      .set('Authorization', auth)
      .send({ hourlyPriceCents: 2000 });
    expect(updated.status).toBe(200);
    expect(updated.body.hourlyPriceCents).toBe(2000);
    expect(updated.body.name).toBe('Centre Court');
  });

  it('rejects invalid opening hours, also when only one side is patched', async () => {
    const { auth } = await ctx.createUser('admin');
    const court = await ctx.createCourt({ openingHour: 8, closingHour: 23 });

    const create = await request(ctx.app)
      .post('/api/courts')
      .set('Authorization', auth)
      .send({ ...newCourt, openingHour: 22, closingHour: 7 });
    expect(create.status).toBe(400);

    const patch = await request(ctx.app)
      .patch(`/api/courts/${court.id}`)
      .set('Authorization', auth)
      .send({ closingHour: 6 });
    expect(patch.status).toBe(400);
    expect(patch.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate court names with 409', async () => {
    const { auth } = await ctx.createUser('admin');
    await request(ctx.app).post('/api/courts').set('Authorization', auth).send(newCourt).expect(201);
    const res = await request(ctx.app).post('/api/courts').set('Authorization', auth).send(newCourt);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('COURT_NAME_TAKEN');
  });

  it('deactivating a court hides it from users and blocks new bookings but keeps its history', async () => {
    const admin = await ctx.createUser('admin');
    const user = await ctx.createUser('user');
    const court = await ctx.createCourt();
    await request(ctx.app)
      .post('/api/bookings')
      .set('Authorization', user.auth)
      .send({ courtId: court.id, startsAt: lisbon('2030-06-11T10:00').toISOString(), durationHours: 1 })
      .expect(201);

    await request(ctx.app)
      .patch(`/api/courts/${court.id}`)
      .set('Authorization', admin.auth)
      .send({ isActive: false })
      .expect(200);

    const userList = await request(ctx.app).get('/api/courts').set('Authorization', user.auth);
    expect(userList.body).toHaveLength(0);
    const adminList = await request(ctx.app).get('/api/courts?includeInactive=true').set('Authorization', admin.auth);
    expect(adminList.body).toHaveLength(1);

    const newBooking = await request(ctx.app)
      .post('/api/bookings')
      .set('Authorization', user.auth)
      .send({ courtId: court.id, startsAt: lisbon('2030-06-11T12:00').toISOString(), durationHours: 1 });
    expect(newBooking.status).toBe(422);

    const day = await request(ctx.app)
      .get('/api/admin/bookings')
      .query({ date: '2030-06-11' })
      .set('Authorization', admin.auth);
    expect(day.body.bookings).toHaveLength(1);
  });
});

describe('GET /api/admin/bookings (day view)', () => {
  it('lists all bookings of the day across courts with expected revenue from confirmed ones', async () => {
    const admin = await ctx.createUser('admin');
    const alice = await ctx.createUser();
    const padel = await ctx.createCourt({ hourlyPriceCents: 2400 });
    const tennis = await ctx.createCourt({ hourlyPriceCents: 1800 });
    const send = (courtId: string, local: string, durationHours: number) =>
      request(ctx.app)
        .post('/api/bookings')
        .set('Authorization', alice.auth)
        .send({ courtId, startsAt: lisbon(local).toISOString(), durationHours });

    await send(padel.id, '2030-06-11T10:00', 2).expect(201); // 4800
    await send(tennis.id, '2030-06-11T18:00', 1).expect(201); // 1800
    const cancelled = await send(tennis.id, '2030-06-11T20:00', 2).expect(201); // cancelled -> 0
    await request(ctx.app).post(`/api/bookings/${cancelled.body.id}/cancel`).set('Authorization', alice.auth).expect(200);
    await send(padel.id, '2030-06-12T10:00', 1).expect(201); // other day

    const res = await request(ctx.app)
      .get('/api/admin/bookings')
      .query({ date: '2030-06-11' })
      .set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(3);
    expect(res.body.confirmedCount).toBe(2);
    expect(res.body.totalRevenueCents).toBe(6600);
    expect(res.body.bookings[0].user).toMatchObject({ id: alice.user.id, email: alice.user.email });
  });

  it('uses facility-local day boundaries, not UTC', async () => {
    const admin = await ctx.createUser('admin');
    const user = await ctx.createUser();
    const court = await ctx.createCourt({ openingHour: 0, closingHour: 24, hourlyPriceCents: 1000 });

    // 00:00 Lisbon on 11 June is 23:00 UTC on 10 June.
    await request(ctx.app)
      .post('/api/bookings')
      .set('Authorization', user.auth)
      .send({ courtId: court.id, startsAt: lisbon('2030-06-11T00:00').toISOString(), durationHours: 1 })
      .expect(201);

    const day = (date: string) =>
      request(ctx.app).get('/api/admin/bookings').query({ date }).set('Authorization', admin.auth);
    expect((await day('2030-06-11')).body.bookings).toHaveLength(1);
    expect((await day('2030-06-10')).body.bookings).toHaveLength(0);
  });
});
