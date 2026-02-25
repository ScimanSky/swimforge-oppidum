CREATE TABLE IF NOT EXISTS "club_ai_automation_configs" (
  "id" serial PRIMARY KEY,
  "club_id" integer NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "actor_user_id" integer NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Rome',
  "scan_source_url" text NOT NULL DEFAULT 'https://www.nuotosardegna.it/category/comunicati-master/',
  "image_model" varchar(120),
  "motivation_prompt" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_ai_automation_configs_club_unique"
  ON "club_ai_automation_configs" ("club_id");

CREATE TABLE IF NOT EXISTS "club_ai_automation_runs" (
  "id" serial PRIMARY KEY,
  "club_id" integer NOT NULL,
  "job_type" varchar(64) NOT NULL,
  "scheduled_key" varchar(120) NOT NULL,
  "status" varchar(20) NOT NULL,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "finished_at" timestamp,
  "actor_user_id" integer,
  "payload_json" json,
  "result_json" json,
  "error_text" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_ai_automation_runs_unique"
  ON "club_ai_automation_runs" ("club_id", "job_type", "scheduled_key");

CREATE INDEX IF NOT EXISTS "idx_club_ai_automation_runs_club_started"
  ON "club_ai_automation_runs" ("club_id", "started_at");

CREATE TABLE IF NOT EXISTS "club_ai_external_meet_sources" (
  "id" serial PRIMARY KEY,
  "club_id" integer NOT NULL,
  "source_url" text NOT NULL,
  "source_hash" varchar(80) NOT NULL,
  "source_date" timestamp,
  "meet_id" integer,
  "status" varchar(20) NOT NULL DEFAULT 'imported',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "club_ai_external_meet_sources_unique"
  ON "club_ai_external_meet_sources" ("club_id", "source_hash");

CREATE INDEX IF NOT EXISTS "idx_club_ai_external_meet_sources_club_created"
  ON "club_ai_external_meet_sources" ("club_id", "created_at");
