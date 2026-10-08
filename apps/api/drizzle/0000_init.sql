CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('padel', 'tennis', 'squash', 'pickleball', 'badminton');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"price_cents" integer NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_duration_valid" CHECK ("bookings"."ends_at" - "bookings"."starts_at" IN (interval '1 hour', interval '2 hours')),
	CONSTRAINT "bookings_starts_on_the_hour" CHECK (extract(epoch from "bookings"."starts_at") % 3600 = 0),
	CONSTRAINT "bookings_price_non_negative" CHECK ("bookings"."price_cents" >= 0),
	CONSTRAINT "bookings_cancelled_at_matches_status" CHECK (("bookings"."status" = 'cancelled') = ("bookings"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport" "sport" NOT NULL,
	"hourly_price_cents" integer NOT NULL,
	"opening_hour" smallint NOT NULL,
	"closing_hour" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courts_name_unique" UNIQUE("name"),
	CONSTRAINT "courts_price_positive" CHECK ("courts"."hourly_price_cents" > 0),
	CONSTRAINT "courts_opening_hours_valid" CHECK ("courts"."opening_hour" >= 0 AND "courts"."closing_hour" <= 24 AND "courts"."opening_hour" < "courts"."closing_hour")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_starts_at_idx" ON "bookings" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "bookings_user_starts_at_idx" ON "bookings" USING btree ("user_id","starts_at");