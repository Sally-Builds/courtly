# Performance note (bonus)

Reproduce with `docker compose run --rm perf`. It seeds a separate `courtly_perf` database (demo data untouched)
with a deterministic dataset and prints the report below. Source: `apps/api/src/scripts/perf.ts`.

Environment of the run below: Docker Desktop on Windows 10 (WSL2), Postgres 16, run while other containers
were active. End-to-end latencies are noisy on this setup (an earlier run on an idle machine gave p50 ≈ 5 ms
for both operations); the database execution times are the stable signal.

Takeaways:
- Both hot read paths are index-served: availability uses the **same GiST index that enforces the
  no-overlap constraint** (no extra index needed), the admin day view uses the btree on `starts_at`.
- Each touches only the rows for one court-day / one day (a handful of buffers), so cost stays flat as
  history grows; the sequential-scan variant is already ~10× slower at 88k rows and grows linearly.

## Results

Dataset: **87,693 bookings** across 20 courts (731 days).

End-to-end service calls (all queries + mapping, excluding HTTP), 300 runs each over random courts/dates:

| Operation | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| Court availability for a day (`getAvailability`) | 15.01 | 30.03 | 44.60 |
| Admin day view, all courts (`getDayView`) | 16.74 | 31.77 | 42.10 |

Database execution time (`EXPLAIN ANALYZE`, 2026-10-18) with the indexes vs. index scans disabled:

| Query | With index | Without (seq scan) |
|---|---|---|
| Availability (GiST `bookings_no_overlap`) | 0.962 ms | 8.889 ms |
| Admin day view (btree `bookings_starts_at_idx`) | 0.607 ms | 7.663 ms |

### Availability query plan
```
Bitmap Heap Scan on bookings (actual time=0.036..0.037 rows=6 loops=1)
  Recheck Cond: ((court_id = '98b25b95-8a24-4ecc-9c1e-8bcac901644b'::uuid) AND (tstzrange(starts_at, ends_at, '[)'::text) && '["2026-10-17 23:00:00+00","2026-10-18 23:00:00+00")'::tstzrange) AND (status = 'confirmed'::booking_status))
  Heap Blocks: exact=1
  Buffers: shared hit=4
  ->  Bitmap Index Scan on bookings_no_overlap (actual time=0.030..0.030 rows=6 loops=1)
        Index Cond: ((court_id = '98b25b95-8a24-4ecc-9c1e-8bcac901644b'::uuid) AND (tstzrange(starts_at, ends_at, '[)'::text) && '["2026-10-17 23:00:00+00","2026-10-18 23:00:00+00")'::tstzrange))
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=27
Planning Time: 0.349 ms
Execution Time: 0.962 ms
```

### Admin day view query plan
```
Sort (actual time=0.422..0.430 rows=126 loops=1)
  Sort Key: bookings.starts_at, courts.name
  Sort Method: quicksort  Memory: 47kB
  Buffers: shared hit=27
  ->  Hash Join (actual time=0.164..0.272 rows=126 loops=1)
        Hash Cond: (bookings.user_id = users.id)
        Buffers: shared hit=27
        ->  Hash Join (actual time=0.060..0.138 rows=126 loops=1)
              Hash Cond: (bookings.court_id = courts.id)
              Buffers: shared hit=24
              ->  Bitmap Heap Scan on bookings (actual time=0.029..0.072 rows=126 loops=1)
                    Recheck Cond: ((starts_at >= '2026-10-17 23:00:00+00'::timestamp with time zone) AND (starts_at < '2026-10-18 23:00:00+00'::timestamp with time zone))
                    Heap Blocks: exact=21
                    Buffers: shared hit=23
                    ->  Bitmap Index Scan on bookings_starts_at_idx (actual time=0.024..0.024 rows=126 loops=1)
                          Index Cond: ((starts_at >= '2026-10-17 23:00:00+00'::timestamp with time zone) AND (starts_at < '2026-10-18 23:00:00+00'::timestamp with time zone))
                          Buffers: shared hit=2
              ->  Hash (actual time=0.015..0.016 rows=20 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 10kB
                    Buffers: shared hit=1
                    ->  Seq Scan on courts (actual time=0.003..0.006 rows=20 loops=1)
                          Buffers: shared hit=1
        ->  Hash (actual time=0.086..0.086 rows=200 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 24kB
              Buffers: shared hit=3
              ->  Seq Scan on users (actual time=0.008..0.035 rows=200 loops=1)
                    Buffers: shared hit=3
Planning:
  Buffers: shared hit=117
Planning Time: 1.608 ms
Execution Time: 0.607 ms
```

