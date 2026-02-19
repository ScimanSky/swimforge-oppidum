-- Social Moderation (Hide posts + Reports)

CREATE TABLE IF NOT EXISTS "social_hidden_posts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "post_id" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_hidden_posts_unique"
  ON "social_hidden_posts"("user_id", "post_id");

CREATE INDEX IF NOT EXISTS "social_hidden_posts_user_id_idx"
  ON "social_hidden_posts"("user_id");

CREATE INDEX IF NOT EXISTS "social_hidden_posts_post_id_idx"
  ON "social_hidden_posts"("post_id");

CREATE TABLE IF NOT EXISTS "social_post_reports" (
  "id" serial PRIMARY KEY,
  "post_id" integer NOT NULL,
  "reporter_user_id" integer NOT NULL,
  "reason" varchar(30) NOT NULL,
  "details" text,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "admin_note" text,
  "handled_by" integer,
  "handled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_post_reports_post_reporter_unique"
  ON "social_post_reports"("post_id", "reporter_user_id");

CREATE INDEX IF NOT EXISTS "social_post_reports_status_idx"
  ON "social_post_reports"("status");

CREATE INDEX IF NOT EXISTS "social_post_reports_created_at_idx"
  ON "social_post_reports"("created_at" DESC);
