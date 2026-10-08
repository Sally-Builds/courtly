import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bookings } from '../../src/db/schema.js';
import { createTestContext, lisbon } from './helpers.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const book = (auth: string, courtId: string, local: string, durationHours = 1) =>
  request(ctx.app)
    .post('/api/bookings')
    .set('Authorization', auth)
    .send({ courtId, startsAt: lisbon(local).toISOString(), durationHours });

describe('double-booking prevention', () => {
  it('rejects booking an already booked slot with 409 SLOT_TAKEN', async () => {
    const court = await ctx.createCourt();
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    expect((await book(alice.auth, court.id, '2030-06-11T10:00')).status).toBe(201);

    const res = await book(bob.auth, court.id, '2030-06-11T10:00');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
  });

  it('detects partial overlaps between 1h and 2h bookings, but allows adjacent ones', async () => {
    const court = await ctx.createCourt();
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    expect((await book(alice.auth, court.id, '2030-06-11T10:00', 2)).status).toBe(201); // 10–12

    expect((await book(bob.auth, court.id, '2030-06-11T11:00', 1)).status).toBe(409); // inside
    expect((await book(bob.auth, court.id, '2030-06-11T09:00', 2)).status).toBe(409); // 9–11 overlaps start
    expect((await book(bob.auth, court.id, '2030-06-11T11:00', 2)).status).toBe(409); // 11–13 overlaps end
    expect((await book(bob.auth, court.id, '2030-06-11T09:00', 1)).status).toBe(201); // 9–10 touches start
    expect((await book(bob.auth, court.id, '2030-06-11T12:00', 1)).status).toBe(201); // 12–13 touches end
  });

  it('allows the same slot on a different court', async () => {
    const [c1, c2] = [await ctx.createCourt(), await ctx.createCourt()];
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    expect((await book(alice.auth, c1.id, '2030-06-11T10:00')).status).toBe(201);
    expect((await book(bob.auth, c2.id, '2030-06-11T10:00')).status).toBe(201);
  });

  it('lets a cancelled slot be booked again', async () => {
    const court = await ctx.createCourt();
    const alice = await ctx.createUser();
    const bob = await ctx.createUser();

    const first = await book(alice.auth, court.id, '2030-06-11T10:00');
    await request(ctx.app).post(`/api/bookings/${first.body.id}/cancel`).set('Authorization', alice.auth).expect(200);

    expect((await book(bob.auth, court.id, '2030-06-11T10:00')).status).toBe(201);
  });

  it('accepts exactly one of many simultaneous requests for the same slot', async () => {
    const court = await ctx.createCourt();
    const users = await Promise.all(Array.from({ length: 15 }, () => ctx.createUser()));

    const responses = await Promise.all(users.map((u) => book(u.auth, court.id, '2030-06-11T18:00')));

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(14);

    const stored = await ctx.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.courtId, court.id), eq(bookings.status, 'confirmed')));
    expect(stored).toHaveLength(1);
  });

  it('accepts exactly one of simultaneous overlapping requests with different durations', async () => {
    const court = await ctx.createCourt();
    const [a, b, c] = await Promise.all([ctx.createUser(), ctx.createUser(), ctx.createUser()]);

    const responses = await Promise.all([
      book(a.auth, court.id, '2030-06-11T10:00', 2), // 10–12
      book(b.auth, court.id, '2030-06-11T11:00', 1), // 11–12
      book(c.auth, court.id, '2030-06-11T11:00', 2), // 11–13
    ]);

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('is enforced by the database itself, independently of the application code', async () => {
    // Two raw transactions, no API involved: the second insert blocks on the first one's
    // uncommitted row, then fails with exclusion_violation (23P01) once the first commits.
    const court = await ctx.createCourt();
    const { user } = await ctx.createUser();
    const insert = `INSERT INTO bookings (court_id, user_id, starts_at, ends_at, price_cents)
                    VALUES ($1, $2, $3, $4, 2000)`;
    const params = [court.id, user.id, lisbon('2030-06-11T10:00'), lisbon('2030-06-11T11:00')];

    const tx1 = await ctx.pool.connect();
    const tx2 = await ctx.pool.connect();
    try {
      await tx1.query('BEGIN');
      await tx2.query('BEGIN');
      await tx1.query(insert, params);

      const second = tx2.query(insert, params).then(
        () => 'inserted',
        (err: { code?: string }) => err.code,
      );
      // Still waiting on tx1's lock.
      const early = await Promise.race([second, new Promise((r) => setTimeout(() => r('blocked'), 300))]);
      expect(early).toBe('blocked');

      await tx1.query('COMMIT');
      expect(await second).toBe('23P01');
      await tx2.query('ROLLBACK');
    } finally {
      tx1.release();
      tx2.release();
    }
  });
});
