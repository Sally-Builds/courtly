# Courtly

Courtly is a booking system for a sports facility. Users browse courts, check availability, and book 1- or 2-hour slots, while admins manage courts, view daily bookings, and track revenue.

## How to run

Requirements: Docker (with Docker Compose v2). Nothing else needs to be installed.

```bash
git clone https://github.com/Sally-Builds/courtly.git
cd courtly
docker compose up
```

The first build takes a few minutes (dependency install + build); later starts take about a minute.
Compose starts everything in order: database → migrations + seed → API → web.

| Service | URL |
|---|---|
| Web app | http://localhost:8080 |
| API | http://localhost:3000/api (health check: `/api/health`) |
| PostgreSQL | `localhost:5433` (user / password / db: `courtly`) |

### Seeded accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@courtly.test | admin123 |
| User | alice@courtly.test | password123 |
| User | bob@courtly.test | password123 |

The login page also has one-click buttons for these accounts.
Seed data: 4 courts (one deactivated, with booking history) and 11 bookings placed relative to the current
day, so there are always past, today's and upcoming bookings.

### Useful commands

```bash
docker compose down -v              # stop and reset the database to the seed data
docker compose run --rm api-test    # backend test suite (runs against the compose database)
docker compose run --rm perf        # performance benchmark (see docs/PERFORMANCE.md)
```

Running locally without Docker for the apps (Node 22+):

```bash
npm install
docker compose up -d db
npm test
```

## Project structure

```
apps/api         Express API (routes → services → pure booking rules), Drizzle migrations, seed
apps/web         React + Vite SPA, served by nginx which proxies /api
packages/shared  zod request schemas, response types and constants used by both apps
docs/            PLAN.md (initial plan), PERFORMANCE.md (benchmark results)
```

## API overview

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/login` | anyone |
| GET | `/api/auth/me` | logged in |
| GET | `/api/courts` | logged in (admins can add `?includeInactive=true`) |
| GET | `/api/courts/:id/availability?date=YYYY-MM-DD` | logged in |
| POST / PATCH | `/api/courts`, `/api/courts/:id` | admin |
| POST | `/api/bookings` | user |
| GET | `/api/bookings/me` | user |
| POST | `/api/bookings/:id/cancel` | user (own bookings) |
| GET | `/api/admin/bookings?date=YYYY-MM-DD` | admin |

Errors always have the shape `{ "error": { "code", "message", "details?" } }`.

## Stack choices and why

### React (Vite) vs Next.js
This app is a dashboard-style SPA with a separate API. Everything is behind login,  no SEO/SSR benefit; a separate backend is required anyway so Next's server layer,  routing, would build complexity for zero benefit.

### Express vs NestJS
The API surface is small, its about 10 endpoints. NestJS will be more useful on large team codebases through modules and dependency injection. At this size it would be mostly boilerplate and decorators around the same logic. Structure/DI/guards are conventions I enforce myself (authenticate, requireRole, central error handler) rather than framework-provided

### PostgreSQL (and Drizzle)
The core invariant is "no two time ranges overlap per court". Postgres expresses that natively with an exclusion constraint over tstzrange (MySQL/Mongo have no equivalent: you'd need locking or slot-per-row tables). Also, timestamptz, CHECK constraints, transactional DDL for migrations.
Drizzle: typed SQL-like queries, plain SQL migrations committed in the repo, and  it surfaces raw SQLSTATE codes (needed to map 23P01 to 409). Prisma can't declare exclusion constraints and wraps the error.

## How double bookings are prevented
### Double-booking prevention (the mechanism)
- Where: `apps/api/drizzle/0001_booking_no_overlap.sql`
  ```sql
  EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')
  ```
- Why a range constraint and not `UNIQUE(court_id, starts_at)`: 1h and 2h bookings with different start times can still overlap (10–12 vs 11–12).
- `[)` half-open ranges meaning back-to-back bookings (10–11, 11–12) are allowed.
- Concurrency: two inserts racing for the same range, the second blocks on the first's index entry; when the first commits, the second fails with SQLSTATE `23P01`. The API then maps it to `409 SLOT_TAKEN` (`bookings.service.ts`). There is deliberately no "check then insert" in the app, the DB is the single source of truth, so no race window.
- Cancelled bookings drop out of the constraint (`WHERE status = 'confirmed'`), the  slot is freed and the row is kept as history.
- Extra: the booking transaction takes `FOR SHARE` on the court row so an admin deactivating the court / changing hours can't interleave with a booking (concurrent bookings still run in parallel since share locks don't conflict).
- Proven by tests (`test/integration/double-booking.test.ts`): 15 simultaneous requests,  exactly 1×201, 14×409; mixed 1h/2h overlapping simultaneous requests; and a raw two-transaction test with no app code showing the second insert blocks then fails with 23P01.


## Other modelling decisions worth mentioning
- All times stored as UTC `timestamptz`; all business-day logic (opening hours, "today", admin day boundaries) in the facility zone `Europe/Lisbon` using Luxon.
- Opening hours are integer hours (0–24) because slots are 1h — 08:30 is not representable on purpose. DB CHECK `opening < closing`.
- DB CHECKs back up app validation: duration ∈ {1h, 2h}, start on the hour, `cancelled_at` set iff status = cancelled, price > 0.
- Price snapshotted on each booking so changing court price doesn't change past revenue.
- Soft cancellation (status), courts never deleted (FK without cascade),  history preserved. Deactivation only blocks new bookings.
- Cancel window: allowed while `now <= startsAt − 2h` (exactly 2h allowed). Error: `422 CANCELLATION_WINDOW_CLOSED` with `details.cancellableUntil`.
- "Past": a slot that has already started can't be booked (`startsAt <= now` rejected).
- Errors: one shape `{ error: { code, message, details? } }`; 400 validation, 401, 403 role/ownership, 404, 409 conflict (slot taken, name taken, already cancelled), 422 business rule.
- Auth: JWT (HS256, 8h) with role claim; `requireRole('admin')` on admin routes,  UI hiding is just for cosmetic. Login uses constant-time-ish path (dummy bcrypt compare for unknown emails).
- Roles are strictly separated as the brief defines them: **users** book/cancel their own bookings, **admins** manage
  courts and see all bookings. Admins are staff accounts, so `/api/bookings/*` requires the `user` role (403 for
  admins), otherwise staff "bookings" would show up as customer revenue. The admin UI only shows Day view and
  Manage courts and lands on the day view after login.
- Time is injected (`Clock`) so tests can freeze "now",  that's how the 2h window boundary is tested exactly.

## What I'd do next
- **Admin books on behalf of a customer** (phone bookings, walk-ins at the front desk):
  - `POST /api/bookings` accepts an optional `userId`, honoured only for admins; customers still book for themselves.
  - New `created_by` column so it's auditable who made the booking vs. who it's for.
  - Admin UI: customer picker on the court availability page, and admin cancel from the day view.
  - Policy decision needed: may staff cancel inside the 2h window (e.g. rain, maintenance)? Likely yes, with a
    reason recorded, a second, explicitly tested cancellation rule.
- **Weekly / monthly revenue insights for admins.** The day view is operational (who plays where, today's
  expected revenue); a week/month view should be analytical, i.e. aggregated rather than a long booking list:
  - API: `GET /api/admin/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin-only, range capped at ~31 days).
  - One SQL aggregate grouped by the *Lisbon* calendar date `(starts_at AT TIME ZONE 'Europe/Lisbon')::date`
    so a 00:30 booking lands on the right day (same pitfall the day-view tests cover). Served by the existing
    `bookings_starts_at_idx`.
  - Returns totals (expected revenue from confirmed bookings, confirmed/cancelled counts), a per-day breakdown
    and a per-court breakdown; optionally occupancy = booked hours ÷ open hours.
  - UI: Day / Week / Month switch on the admin page; Day stays as is.
  - Tests: cancelled bookings excluded from revenue, Lisbon day bucketing, range limit, 403 for non-admins.
  - Left out deliberately: the brief asks for a day view, and I prioritised a correct, tested core over scope.
- Role in JWT means a demoted admin keeps access until token expiry, short-lived access tokens + refresh, or we could check role from DB per request.
- Idempotency key on `POST /bookings` (double-click / retry safety).
- Facility entity with its own time zone and per-weekday opening hours / closures (holidays, maintenance blocks as a booking type).
- On court deactivation: list/notify affected future bookings, optional bulk cancel.
- Booking horizon limit (e.g. max 30 days ahead) and per-user limits (max active bookings, no overlapping bookings for the same user across courts, could also be a second exclusion constraint on user_id).
- Real-time availability via SSE + Postgres LISTEN/NOTIFY.
- Pagination for past bookings; admin filters (court, user); CSV export.
- Payments / pricing rules (peak hours), audit log of who cancelled/changed what.
- Rate limiting on login, structured logging (pino) + request ids, OpenAPI spec generated from the zod schemas, CI pipeline running tests in Docker, E2E tests (Playwright).