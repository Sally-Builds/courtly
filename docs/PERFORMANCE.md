# Performance note (bonus)

Reproduce with `docker compose run --rm perf`. It seeds a separate `courtly_perf` database (demo data untouched)
with a deterministic dataset and prints the report below. Source: `apps/api/src/scripts/perf.ts`.

To save a run to a file (only the report is written; Docker's build/progress output stays in the terminal):

```bash
docker compose run --rm -T perf > perf-results.md                                   # bash / macOS / Linux
docker compose run --rm -T perf | Out-File -Encoding utf8 perf-results.md            # Windows PowerShell
```

Environment of the run below: Docker Desktop on Windows 10 (WSL2), Postgres 16, otherwise idle machine.
Absolute numbers vary between runs and machines (on a busier machine end-to-end p50 went up to ~15 ms and the
indexed queries to ~1 ms); the relative difference between indexed and sequential-scan plans is the stable signal.

Takeaways:
- Both hot read paths are index-served: availability uses the **same GiST index that enforces the
  no-overlap constraint** (no extra index needed), the admin day view uses the btree on `starts_at`.
- Each touches only the rows for one court-day / one day (a handful of buffers), so cost stays flat as
  history grows; the sequential-scan plans are already 15–135× slower at 88k rows and grow linearly.

## Results

Dataset: **87,693 bookings** across 20 courts (731 days).

End-to-end service calls (all queries + mapping, excluding HTTP), 300 runs each over random courts/dates:

| Operation | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| Court availability for a day (`getAvailability`) | 3.87 | 8.12 | 12.16 |
| Admin day view, all courts (`getDayView`) | 4.47 | 7.39 | 9.87 |

Database execution time (`EXPLAIN ANALYZE`, 2026-10-20) with the indexes vs. index scans disabled:

| Query | With index | Without (seq scan) |
|---|---|---|
| Availability (GiST `bookings_no_overlap`) | 0.076 ms | 10.247 ms |
| Admin day view (btree `bookings_starts_at_idx`) | 0.671 ms | 11.520 ms |

### Availability query plan
```
Bitmap Heap Scan on bookings (actual time=0.038..0.040 rows=6 loops=1)
  Recheck Cond: ((court_id = 'a6ace0b7-1e2d-4584-913c-3cef46e12921'::uuid) AND (tstzrange(starts_at, ends_at, '[)'::text) && '["2026-10-19 23:00:00+00","2026-10-20 23:00:00+00")'::tstzrange) AND (status = 'confirmed'::booking_status))
  Heap Blocks: exact=1
  Buffers: shared hit=4
  ->  Bitmap Index Scan on bookings_no_overlap (actual time=0.032..0.033 rows=6 loops=1)
        Index Cond: ((court_id = 'a6ace0b7-1e2d-4584-913c-3cef46e12921'::uuid) AND (tstzrange(starts_at, ends_at, '[)'::text) && '["2026-10-19 23:00:00+00","2026-10-20 23:00:00+00")'::tstzrange))
        Buffers: shared hit=3
Planning:
  Buffers: shared hit=27
Planning Time: 0.373 ms
Execution Time: 0.076 ms
```

### Admin day view query plan
```
Sort (actual time=0.533..0.541 rows=126 loops=1)
  Sort Key: bookings.starts_at, courts.name
  Sort Method: quicksort  Memory: 47kB
  Buffers: shared hit=27
  ->  Hash Join (actual time=0.215..0.327 rows=126 loops=1)
        Hash Cond: (bookings.user_id = users.id)
        Buffers: shared hit=27
        ->  Hash Join (actual time=0.119..0.201 rows=126 loops=1)
              Hash Cond: (bookings.court_id = courts.id)
              Buffers: shared hit=24
              ->  Bitmap Heap Scan on bookings (actual time=0.091..0.134 rows=126 loops=1)
                    Recheck Cond: ((starts_at >= '2026-10-19 23:00:00+00'::timestamp with time zone) AND (starts_at < '2026-10-20 23:00:00+00'::timestamp with time zone))
                    Heap Blocks: exact=21
                    Buffers: shared hit=23
                    ->  Bitmap Index Scan on bookings_starts_at_idx (actual time=0.080..0.081 rows=126 loops=1)
                          Index Cond: ((starts_at >= '2026-10-19 23:00:00+00'::timestamp with time zone) AND (starts_at < '2026-10-20 23:00:00+00'::timestamp with time zone))
                          Buffers: shared hit=2
              ->  Hash (actual time=0.014..0.014 rows=20 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 10kB
                    Buffers: shared hit=1
                    ->  Seq Scan on courts (actual time=0.003..0.005 rows=20 loops=1)
                          Buffers: shared hit=1
        ->  Hash (actual time=0.085..0.086 rows=200 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 24kB
              Buffers: shared hit=3
              ->  Seq Scan on users (actual time=0.008..0.031 rows=200 loops=1)
                    Buffers: shared hit=3
Planning:
  Buffers: shared hit=104
Planning Time: 1.123 ms
Execution Time: 0.671 ms
```
