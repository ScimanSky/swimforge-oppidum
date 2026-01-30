-- AI insights per single activity
CREATE TABLE IF NOT EXISTS "activity_ai_insights" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "activity_id" integer NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "bullets" json NOT NULL,
  "tags" json NOT NULL,
  "generated_at" timestamp NOT NULL DEFAULT now(),
  "seen_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "activity_ai_insights_activity_id_idx"
  ON "activity_ai_insights"("activity_id");

CREATE INDEX IF NOT EXISTS "activity_ai_insights_user_id_idx"
  ON "activity_ai_insights"("user_id");
