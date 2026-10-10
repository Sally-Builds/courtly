# Courtly — Product requirements

Product requirements for Courtly as built: scope, roles, business rules with their edge cases, and acceptance
criteria. Implementation details live in `PLAN.md`; verification status lives in `CHECKLIST.md`.

## 1. Overview

Courtly lets customers of a single sports facility book courts (padel, tennis, …) by the hour, and lets the
facility's staff manage courts and see each day's bookings and expected revenue.

## 2. Goals and non-goals

**Goals**
- A customer can see when a court is free and book it in a few clicks.
- A court/time can never be double-booked, including under simultaneous requests.
- Staff can manage courts without losing booking history, and see a day's bookings and expected revenue.

**Non-goals (this version)**
- Payments, refunds, pricing rules (peak/off-peak).
- External identity providers, sign-up, password reset (seeded accounts only).
- Multiple facilities or time zones.
- Staff booking on behalf of customers; weekly/monthly analytics; waitlists; real-time updates.

## 3. Users and roles

| Role | Can | Cannot |
|---|---|---|
| **User** (customer) | Browse active courts, view availability, create bookings, cancel own bookings, see own bookings | Manage courts, see other users' bookings, cancel others' bookings |
| **Admin** (staff) | Create/edit/activate/deactivate courts, see all bookings for a day with expected revenue, view availability | Create, list or cancel bookings (staff accounts are not customers) |

Roles are enforced by the API on every request; the UI only hides what a role can't use.

## 4. Functional requirements

### FR-1 Authentication
- Users sign in with email and password; the API issues a token that identifies the user and role.
- Unauthenticated requests to anything except login are rejected (401).

### FR-2 Courts
- A court has a name (unique), sport, hourly price, opening hours and an active/inactive status.
- Admins can create and edit courts and toggle them active/inactive.
- Deactivating a court stops new bookings and hides it from customers; existing bookings and history remain.
- Acceptance: invalid hours (opening ≥ closing) are rejected; duplicate names are rejected (409).

### FR-3 Availability
- For a chosen court and date, the customer sees one slot per opening hour, each marked
  available, booked or past.
- Acceptance: slots exactly span the court's opening hours; every hour covered by a confirmed booking
  (including both hours of a 2-hour booking) is booked; cancelled bookings don't block slots.

### FR-4 Booking
- A customer books a court for 1 or 2 consecutive hours, starting on the hour.
- Acceptance: overlapping requests are rejected with 409 `SLOT_TAKEN`, including when submitted at the same
  instant; bookings in the past, outside opening hours or on an inactive court are rejected with 422.

### FR-5 Cancellation
- A customer can cancel their own booking up to 2 hours before it starts.
- Acceptance: exactly 2 hours before is allowed; any later is rejected with 422
  `CANCELLATION_WINDOW_CLOSED` and a message stating the rule; a cancelled booking frees its slot and stays in
  history.

### FR-6 My bookings
- A customer sees their bookings split into upcoming and past, including cancelled ones (marked as such).

### FR-7 Admin day view
- An admin picks a date and sees every booking starting that day across all courts (with customer, court,
  time, status, price) and the day's total expected revenue.
- Acceptance: revenue counts confirmed bookings only; cancelled bookings are listed but excluded.

## 5. Business rules and decisions

| ID | Rule / decision | Rationale |
|---|---|---|
| BR-1 | All "day" and "hour" logic uses the facility time zone (Europe/Lisbon); timestamps are stored in UTC. | Opening hours and "today" are local concepts; DST days must still work. |
| BR-2 | Slot granularity is 1 hour; opening hours are whole hours (0–24). | A half-hour opening time couldn't be represented as slots. |
| BR-3 | Bookings last 1 or 2 hours and start on the hour. | Also enforced by database CHECK constraints. |
| BR-4 | A booking must fit entirely inside opening hours (a 2-hour booking can't start in the last open hour). | A booking can't run past closing time. |
| BR-5 | A slot that has already started counts as past and can't be booked. | Avoids booking a slot that is already partly over. |
| BR-6 | Time ranges are start-inclusive, end-exclusive, so back-to-back bookings (10–11, 11–12) are allowed. | Adjacent bookings don't overlap. |
| BR-7 | Two confirmed bookings on the same court may never overlap; enforced by the database. | Must hold under concurrency; an app-level check can race. |
| BR-8 | Cancellation is allowed while now ≤ start − 2h (boundary inclusive) and is a status change, never a delete. | Keeps history and revenue reporting honest. |
| BR-9 | The price is copied onto each booking when it's made. | Editing a court's price must not change past revenue. |
| BR-10 | Changing a court's hours or deactivating it never alters existing bookings. | Customers keep what they booked; staff decide what to do with them. |
| BR-11 | A booking counts as upcoming until it has ended. | A booking in progress is still "current" for the customer. |
| BR-12 | Admins cannot create or cancel bookings. | Staff accounts aren't customers; their bookings would distort revenue. |

## 6. Non-functional requirements

- **Language:** TypeScript in strict mode across API, web and shared code.
- **Runbook:** `docker compose up` starts the database, migrations + seed, API and web app with no other steps.
- **Seed data:** at least 3 courts, 2 users, 1 admin and a handful of bookings, relative to the current date.
- **Tests:** automated tests for double-booking prevention (incl. concurrency), the cancellation window and
  opening hours, run against a real PostgreSQL.
- **Errors:** every error response has the shape `{ error: { code, message, details? } }`.
- **Security:** passwords stored as bcrypt hashes; role checks on the server; no secrets beyond local dev defaults.
- **Performance:** availability and admin day-view queries stay index-served with 10k+ bookings
  (measured in `PERFORMANCE.md`).

## 7. Future work

Weekly/monthly revenue insights, staff booking on behalf of customers, idempotent booking requests,
per-user limits and booking horizon, real-time availability, pagination of booking history.
