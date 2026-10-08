-- Double-booking guard, enforced by Postgres itself.
--
-- Two confirmed bookings on the same court may never have overlapping [starts_at, ends_at) ranges.
-- A range check (&&) is needed rather than UNIQUE(court_id, starts_at): a 10:00-12:00 booking and an
-- 11:00-12:00 booking have different start times but still collide.
--
-- Under concurrency, when two transactions insert overlapping rows at the same time, the second one
-- blocks on the first one's index entry; once the first commits, the second fails with SQLSTATE 23P01
-- (exclusion_violation), which the API maps to 409 SLOT_TAKEN. No application-level lock or
-- read-then-write check is involved.
--
-- Cancelled bookings are excluded by the WHERE clause, so cancelling frees the slot while the row
-- (history) stays. btree_gist is required to use plain equality (court_id WITH =) in a GiST index.
-- The same GiST index also serves the availability query (court_id = $1 AND range && day).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("court_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'confirmed');
