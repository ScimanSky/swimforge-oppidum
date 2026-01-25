-- Add new technical and physiological metrics columns to swimming_activities table
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "avg_stroke_distance" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "avg_strokes" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "avg_stroke_cadence" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "training_effect" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "anaerobic_training_effect" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "vo2_max_value" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "recovery_time_hours" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "resting_heart_rate" integer;
ALTER TABLE "swimming_activities" ADD COLUMN IF NOT EXISTS "avg_stress" integer;

-- Add AI insights cache table
CREATE TABLE IF NOT EXISTS "ai_insights_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"insights" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);

-- Add index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS "ai_insights_cache_user_id_idx" ON "ai_insights_cache" ("user_id");
