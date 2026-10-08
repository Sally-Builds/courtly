import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { createDb, type Db } from '../db/client.js';
import { ensureDatabase } from '../db/ensure-database.js';
import { runMigrations } from '../db/migrations.js';
import { bookings, courts, users } from '../db/schema.js';
import { facilityDateOf, facilityDayBounds, facilityDayStart } from '../lib/facility-time.js';
import { bookingsStartingBetween, getDayView } from '../modules/admin/admin.service.js';
import { confirmedBookingsOverlapping, getAvailability } from '../modules/courts/courts.service.js';

/**
 * Performance note (bonus). Runs in its own database so demo data is untouched:
 *   docker compose run --rm perf
 * Seeds ~90k bookings (20 courts x 2 years, ~45% occupancy), then reports EXPLAIN ANALYZE plans and
 * latency percentiles for the two hot read paths: court availability and the admin day view.
 */
const url = process.env.PERF_DATABASE_URL ?? 'postgres://courtly:courtly@localhost:5433/courtly_perf';
const COURTS = 20;
const DAYS_BACK = 365;
const DAYS_FORWARD = 365;
const RUNS = 300;

await ensureDatabase(url);
const { db, pool } = createDb(url);

try {
  await runMigrations(db);
  await seedIfNeeded(db);
  await db.execute(sql`ANALYZE`);
  await report(db);
} finally {
  await pool.end();
}

/** Deterministic PRNG so every run produces the same dataset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function seedIfNeeded(db: Db) {
  const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookings);
  if (count >= 10_000) {
    console.log(`[perf] reusing existing dataset (${count} bookings)`);
    return;
  }

  console.log('[perf] seeding…');
  const rand = mulberry32(42);
  const userRows = await db
    .insert(users)
    .values(Array.from({ length: 200 }, (_, i) => ({ email: `perf${i}@courtly.test`, name: `Perf User ${i}`, passwordHash: 'x' })))
    .returning({ id: users.id });
  const courtRows = await db
    .insert(courts)
    .values(
      Array.from({ length: COURTS }, (_, i) => ({
        name: `Perf Court ${i + 1}`,
        sport: i % 2 === 0 ? ('padel' as const) : ('tennis' as const),
        hourlyPriceCents: 1500 + (i % 5) * 300,
        openingHour: 8,
        closingHour: 23,
      })),
    )
    .returning();

  const today = facilityDayStart(facilityDateOf(new Date()));
  const rows: (typeof bookings.$inferInsert)[] = [];
  for (const court of courtRows) {
    for (let d = -DAYS_BACK; d <= DAYS_FORWARD; d++) {
      const day = today.plus({ days: d });
      let hour = court.openingHour;
      while (hour < court.closingHour) {
        if (rand() < 0.45) {
          const duration = rand() < 0.3 && hour + 2 <= court.closingHour ? 2 : 1;
          const startsAt = day.set({ hour }).toJSDate();
          const cancelled = rand() < 0.1;
          rows.push({
            courtId: court.id,
            userId: userRows[Math.floor(rand() * userRows.length)]!.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + duration * 3_600_000),
            priceCents: court.hourlyPriceCents * duration,
            ...(cancelled ? { status: 'cancelled' as const, cancelledAt: startsAt } : {}),
          });
          hour += duration;
        } else {
          hour += 1;
        }
      }
    }
  }

  for (let i = 0; i < rows.length; i += 2000) {
    await db.insert(bookings).values(rows.slice(i, i + 2000));
  }
  console.log(`[perf] inserted ${rows.length} bookings`);
}

type SqlQuery = { toSQL(): { sql: string; params: unknown[] } };

/** EXPLAIN ANALYZE output, optionally with index scans disabled to show what the indexes buy. */
async function explain(query: SqlQuery, { withoutIndexes = false } = {}) {
  const { sql: text, params } = query.toSQL();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (withoutIndexes) {
      await client.query('SET LOCAL enable_indexscan = off');
      await client.query('SET LOCAL enable_bitmapscan = off');
    }
    const res = await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${text}`, params);
    await client.query('COMMIT');
    return res.rows.map((r: Record<string, string>) => r['QUERY PLAN']).join('\n');
  } finally {
    client.release();
  }
}

function executionMs(plan: string) {
  return /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? '?';
}

async function time(fn: () => Promise<unknown>) {
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const pct = (p: number) => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))]!.toFixed(2);
  return { p50: pct(50), p95: pct(95), p99: pct(99) };
}

async function report(db: Db) {
  const [{ total } = { total: 0 }] = await db.select({ total: sql<number>`count(*)::int` }).from(bookings);
  const courtIds = (await db.select({ id: courts.id }).from(courts)).map((c) => c.id);
  const rand = mulberry32(7);
  const randomDate = () =>
    DateTime.now()
      .plus({ days: Math.floor(rand() * 600) - 300 })
      .toISODate()!;
  const randomCourt = () => courtIds[Math.floor(rand() * courtIds.length)]!;

  const sampleDate = DateTime.now().plus({ days: 10 }).toISODate()!;
  const day = facilityDayBounds(sampleDate);
  const availabilityQuery = () => confirmedBookingsOverlapping(db, courtIds[0]!, day.start, day.end);
  const dayViewQuery = () => bookingsStartingBetween(db, day.start, day.end);

  const availabilityPlan = await explain(availabilityQuery());
  const dayViewPlan = await explain(dayViewQuery());
  const availabilitySeqPlan = await explain(availabilityQuery(), { withoutIndexes: true });
  const dayViewSeqPlan = await explain(dayViewQuery(), { withoutIndexes: true });

  const now = new Date();
  const availabilityTiming = await time(() => getAvailability(db, randomCourt(), randomDate(), now));
  const dayViewTiming = await time(() => getDayView(db, randomDate()));

  console.log(`
## Performance results

Dataset: **${total.toLocaleString('en')} bookings** across ${courtIds.length} courts (${DAYS_BACK + DAYS_FORWARD + 1} days).

End-to-end service calls (all queries + mapping, excluding HTTP), ${RUNS} runs each over random courts/dates:

| Operation | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| Court availability for a day (\`getAvailability\`) | ${availabilityTiming.p50} | ${availabilityTiming.p95} | ${availabilityTiming.p99} |
| Admin day view, all courts (\`getDayView\`) | ${dayViewTiming.p50} | ${dayViewTiming.p95} | ${dayViewTiming.p99} |

Database execution time (\`EXPLAIN ANALYZE\`, ${sampleDate}) with the indexes vs. index scans disabled:

| Query | With index | Without (seq scan) |
|---|---|---|
| Availability (GiST \`bookings_no_overlap\`) | ${executionMs(availabilityPlan)} ms | ${executionMs(availabilitySeqPlan)} ms |
| Admin day view (btree \`bookings_starts_at_idx\`) | ${executionMs(dayViewPlan)} ms | ${executionMs(dayViewSeqPlan)} ms |

### Availability query plan
\`\`\`
${availabilityPlan}
\`\`\`

### Admin day view query plan
\`\`\`
${dayViewPlan}
\`\`\`
`);
}
