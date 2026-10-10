# Courtly — implementation plan

## Stack
- **DB:** PostgreSQL 16 — exclusion constraint makes "no overlapping bookings" a schema guarantee.
- **Queries/migrations:** Drizzle ORM + drizzle-kit; the exclusion constraint lives in a hand-written SQL migration.
- **API:** Express 5 (async errors handled natively), zod validation, JWT auth, layered `routes → service → db`.
- **Web:** React + Vite SPA, React Router, TanStack Query, Tailwind. Served by nginx, which proxies `/api`.
- **Shared:** `packages/shared` — zod request schemas + response types + constants used by both apps.
- **Tests:** Vitest. Unit tests for pure rules, integration tests (Supertest) against a real Postgres.

## Data model
- `users(id uuid, email unique, password_hash, name, role user|admin)`
- `courts(id, name unique, sport enum, hourly_price_cents > 0, opening_hour, closing_hour, is_active)`
  - `CHECK (0 <= opening_hour < closing_hour <= 24)` — hours are integers because slot granularity is 1h.
- `bookings(id, court_id, user_id, starts_at timestamptz, ends_at timestamptz, price_cents, status confirmed|cancelled, cancelled_at)`
  - `CHECK (ends_at - starts_at IN (1h, 2h))`, `CHECK (starts_at on the hour)`
  - `EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status = 'confirmed')`
  - price snapshotted at booking time; cancellation is a status change (history kept).

## Rules
- Facility time zone `Europe/Lisbon`; times stored in UTC, all day/hour logic done in facility tz (Luxon).
- Book: court active, start on the hour, strictly in the future, 1–2h, fully within opening hours.
- Overlap → Postgres `23P01` → `409 SLOT_TAKEN`. No app-level pre-check is relied upon.
- Court row is locked `FOR SHARE` while booking, so a concurrent deactivate/edit can't slip in between.
- Cancel: owner only, allowed while `now <= starts_at - 2h`, otherwise `422 CANCELLATION_WINDOW_CLOSED`.
- Deactivating a court or changing its hours never touches existing bookings.

## API
```
POST  /api/auth/login            GET /api/auth/me
GET   /api/courts                POST /api/courts [admin]     PATCH /api/courts/:id [admin]
GET   /api/courts/:id/availability?date=YYYY-MM-DD
POST  /api/bookings [user]       GET /api/bookings/me [user]  POST /api/bookings/:id/cancel [user]
GET   /api/admin/bookings?date=YYYY-MM-DD [admin]  → { bookings, totalRevenueCents }
```
Errors: `{ error: { code, message, details? } }` — 400 / 401 / 403 / 404 / 409 / 422.
Roles: users book and cancel their own bookings; admins are staff who manage courts and see all bookings.

## Docker
`db` (healthcheck) → `migrate` (migrations + idempotent seed, one-shot) → `api` → `web` (nginx).
Seed bookings are relative to "today" so they're meaningful whenever the project is run.
`api-test` (profile `test`) runs the backend test suite against the compose database.
`perf` (profile `perf`) runs the performance benchmark in a separate `courtly_perf` database.

## Bonus
Performance note: seed 10k+ bookings, report `EXPLAIN ANALYZE` timings for availability and admin day view
(results in `docs/PERFORMANCE.md`).
