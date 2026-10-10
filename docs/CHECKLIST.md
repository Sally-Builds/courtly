# Courtly — Requirements checklist

Each requirement mapped to where it is implemented and how it is verified.
Paths are relative to the repo root; `api/` = `apps/api/`, `web/` = `apps/web/`.

## Functional requirements

| | Requirement | Implemented in | Verified by |
|---|---|---|---|
| ✅ | Login with seeded users, token-based | `api/src/modules/auth/` | `admin.test.ts` (forged token → 401); manual login in UI |
| ✅ | Role separation enforced by the API | `api/src/middleware/auth.ts` (`requireRole`), `api/src/app.ts` | `admin.test.ts` → "role separation is enforced by the API" |
| ✅ | Court: name, sport, hourly price, opening hours, active flag | `api/src/db/schema.ts` | Schema + CHECK constraints in `api/drizzle/0000_init.sql` |
| ✅ | Admin creates / edits / deactivates courts | `api/src/modules/courts/` · `web/src/pages/AdminCourtsPage.tsx` | `admin.test.ts` → "court management" |
| ✅ | Deactivation keeps booking history | `courts.service.ts` (status flag, no delete) | `admin.test.ts` → "deactivating a court … keeps its history" |
| ✅ | Day's 1-hour slots, available / taken | `booking-rules.ts` (`buildDaySlots`) · `web/src/components/SlotGrid.tsx` | `availability.test.ts`, `booking-rules.test.ts`, `SlotGrid.test.tsx` |
| ✅ | Availability respects opening hours and bookings | `courts.service.ts` (`getAvailability`) | `availability.test.ts` |
| ✅ | Book 1 or 2 consecutive hours | `packages/shared/src/schemas.ts`, `bookings.service.ts` | `bookings.test.ts` |
| ✅ | No double booking, incl. simultaneous submits (DB-level) | `api/drizzle/0001_booking_no_overlap.sql` | `double-booking.test.ts` (15 parallel requests; raw two-transaction test) |
| ✅ | No bookings in the past | `booking-rules.ts` (`assertBookable`) | `bookings.test.ts`, `booking-rules.test.ts` |
| ✅ | Opening-hours validation | `booking-rules.ts` (`assertBookable`) | `bookings.test.ts` (before open, at close, past close), `booking-rules.test.ts` |
| ✅ | Cancel up to 2h before start, clear error after | `booking-rules.ts` (`assertCancellable`), `bookings.service.ts` | `bookings.test.ts` (exactly 2h ok, 2h−1min rejected), `booking-rules.test.ts` |
| ✅ | My bookings: upcoming and past | `bookings.service.ts` (`listMyBookings`) · `web/src/pages/MyBookingsPage.tsx` | `bookings.test.ts` → "GET /api/bookings/me" |
| ✅ | Admin day view across courts with expected revenue | `api/src/modules/admin/` · `web/src/pages/AdminDayPage.tsx` | `admin.test.ts` → "day view" (revenue, Lisbon day boundaries) |

## Technical requirements

| | Requirement | Where / how |
|---|---|---|
| ✅ | TypeScript strict everywhere | `tsconfig.base.json` (`strict: true`), extended by all packages; `npm run typecheck` |
| ✅ | React frontend | `apps/web` (React + Vite) |
| ✅ | Separate Express backend | `apps/api` (Express 5) |
| ✅ | PostgreSQL with a real schema | `apps/api/src/db/schema.ts`, migrations in `apps/api/drizzle/` |
| ✅ | Seed: ≥3 courts, ≥2 users, 1 admin, a handful of bookings | `apps/api/src/scripts/seed.ts` (4 courts, 2 users, 1 admin, 11 bookings) |
| ✅ | `docker compose up` starts everything | `docker-compose.yml`, `Dockerfile`; verified from a fresh clone on empty volumes |
| ✅ | Backend tests for the booking rules | 57 tests: `apps/api/test/unit`, `apps/api/test/integration` |
| ✅ | Frontend tests (bonus) | 5 tests: `apps/web/src/components/SlotGrid.test.tsx` |
| ✅ | Bonus (one): performance note | `apps/api/src/scripts/perf.ts`, results in `docs/PERFORMANCE.md` |

## Delivery

- [x] All tests pass (`npm test`, `docker compose run --rm api-test`)
- [x] Fresh clone → `docker compose up` → app usable with seeded accounts
- [x] Clean commit history telling the story of the work
- [x] README: how to run, stack choices and why, double-booking mechanism, next steps
