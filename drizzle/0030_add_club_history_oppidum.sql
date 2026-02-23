CREATE TABLE IF NOT EXISTS "club_historical_sources" (
  "id" serial PRIMARY KEY NOT NULL,
  "club_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "root_url" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "club_historical_sources_club_provider_unique" UNIQUE ("club_id", "provider")
);

CREATE TABLE IF NOT EXISTS "club_historical_import_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "club_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "mode" varchar(40) NOT NULL,
  "triggered_by" integer NOT NULL,
  "status" varchar(20) NOT NULL,
  "source_url" text NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "processed_pages" integer DEFAULT 0 NOT NULL,
  "processed_records" integer DEFAULT 0 NOT NULL,
  "created_records" integer DEFAULT 0 NOT NULL,
  "updated_records" integer DEFAULT 0 NOT NULL,
  "error_records" integer DEFAULT 0 NOT NULL,
  "errors_json" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_club_historical_import_runs_club_started"
  ON "club_historical_import_runs" ("club_id", "started_at");

CREATE TABLE IF NOT EXISTS "club_historical_athletes" (
  "id" serial PRIMARY KEY NOT NULL,
  "club_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "athlete_slug" varchar(255) NOT NULL,
  "athlete_name" varchar(255) NOT NULL,
  "source_url" text NOT NULL,
  "linked_user_id" integer,
  "last_import_run_id" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "club_historical_athletes_unique" UNIQUE ("club_id", "provider", "athlete_slug")
);

CREATE INDEX IF NOT EXISTS "idx_club_historical_athletes_club_name"
  ON "club_historical_athletes" ("club_id", "athlete_name");

CREATE TABLE IF NOT EXISTS "club_historical_meets" (
  "id" serial PRIMARY KEY NOT NULL,
  "club_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "meet_slug" varchar(255) NOT NULL,
  "meet_name" varchar(255) NOT NULL,
  "meet_date" timestamp,
  "source_url" text NOT NULL,
  "season_label" varchar(20),
  "last_import_run_id" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "club_historical_meets_unique" UNIQUE ("club_id", "provider", "meet_slug")
);

CREATE INDEX IF NOT EXISTS "idx_club_historical_meets_club_date"
  ON "club_historical_meets" ("club_id", "meet_date");

CREATE TABLE IF NOT EXISTS "club_historical_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "club_id" integer NOT NULL,
  "provider" varchar(40) NOT NULL,
  "meet_id" integer NOT NULL,
  "athlete_id" integer NOT NULL,
  "event_label" varchar(255) NOT NULL,
  "event_label_norm" varchar(255) NOT NULL,
  "final_time_raw" varchar(64),
  "final_time_cs" integer,
  "points" real,
  "record_raw" text,
  "notes" text,
  "last_import_run_id" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "club_historical_results_unique" UNIQUE ("club_id", "provider", "meet_id", "athlete_id", "event_label_norm")
);

CREATE INDEX IF NOT EXISTS "idx_club_historical_results_meet"
  ON "club_historical_results" ("meet_id");

CREATE INDEX IF NOT EXISTS "idx_club_historical_results_athlete"
  ON "club_historical_results" ("athlete_id");

INSERT INTO "club_historical_sources" ("club_id", "provider", "root_url", "enabled", "created_at", "updated_at")
SELECT c.id, 'oppidum_html', 'https://www.oppidumsport.it/master.html', true, now(), now()
FROM "community_clubs" c
WHERE lower(trim(c.name)) = 'cuori solitari'
ON CONFLICT ("club_id", "provider") DO UPDATE
SET "root_url" = EXCLUDED."root_url",
    "enabled" = EXCLUDED."enabled",
    "updated_at" = now();
