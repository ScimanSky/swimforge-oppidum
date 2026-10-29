-- «Segna completato» of a published club workout, stored for real: one row per athlete and
-- workout (the athlete can undo it), read by the coach as «fatto da N su M». activity_id stays
-- null until the automatic link to the Garmin swim. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS "club_workout_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer NOT NULL,
	"club_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"activity_id" integer,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_workout_completions_user_workout_unique" UNIQUE("user_id","workout_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_club_workout_completions_workout" ON "club_workout_completions" USING btree ("workout_id");
