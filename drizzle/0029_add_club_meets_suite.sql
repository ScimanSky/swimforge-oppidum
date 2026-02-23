-- Club Suite V1: meets, entries, result imports and rankings

CREATE TABLE IF NOT EXISTS "club_meets" (
  "id" serial PRIMARY KEY,
  "club_id" integer NOT NULL,
  "created_by" integer NOT NULL,
  "name" varchar(200) NOT NULL,
  "venue" text,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "registration_deadline" timestamp NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Rome',
  "notes" text,
  "published_at" timestamp,
  "opened_at" timestamp,
  "closed_at" timestamp,
  "completed_at" timestamp,
  "cancelled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_club_meets_club_status"
  ON "club_meets" ("club_id", "status");

CREATE INDEX IF NOT EXISTS "idx_club_meets_club_start_date"
  ON "club_meets" ("club_id", "start_date");

CREATE TABLE IF NOT EXISTS "club_meet_events" (
  "id" serial PRIMARY KEY,
  "meet_id" integer NOT NULL,
  "label" varchar(120) NOT NULL,
  "program_order" integer NOT NULL DEFAULT 0,
  "distance_meters" integer,
  "stroke" varchar(32),
  "gender" varchar(16),
  "master_category" varchar(64),
  "scheduled_at" timestamp,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_club_meet_events_meet_order"
  ON "club_meet_events" ("meet_id", "program_order", "id");

CREATE TABLE IF NOT EXISTS "club_meet_entries" (
  "id" serial PRIMARY KEY,
  "meet_event_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "seed_time_cs" integer,
  "notes" text,
  "set_by_staff_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "club_meet_entries_event_user_unique" UNIQUE("meet_event_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_club_meet_entries_event_status"
  ON "club_meet_entries" ("meet_event_id", "status");

CREATE INDEX IF NOT EXISTS "idx_club_meet_entries_user"
  ON "club_meet_entries" ("user_id");

CREATE TABLE IF NOT EXISTS "club_meet_result_import_batches" (
  "id" serial PRIMARY KEY,
  "meet_id" integer NOT NULL,
  "imported_by" integer NOT NULL,
  "mode" varchar(20) NOT NULL,
  "source_filename" varchar(255),
  "raw_payload" json,
  "processed_rows" integer NOT NULL DEFAULT 0,
  "success_rows" integer NOT NULL DEFAULT 0,
  "error_rows" integer NOT NULL DEFAULT 0,
  "errors" json,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_club_meet_import_batches_meet"
  ON "club_meet_result_import_batches" ("meet_id", "created_at");

CREATE TABLE IF NOT EXISTS "club_meet_results" (
  "id" serial PRIMARY KEY,
  "meet_id" integer NOT NULL,
  "meet_event_id" integer NOT NULL,
  "user_id" integer,
  "athlete_name" varchar(255) NOT NULL,
  "athlete_email" varchar(320),
  "club_name" varchar(255),
  "final_time_cs" integer,
  "rank" integer,
  "points" real,
  "is_disqualified" boolean NOT NULL DEFAULT false,
  "notes" text,
  "seed_time_cs" integer,
  "import_batch_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "club_meet_results_event_user_unique" UNIQUE("meet_event_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_club_meet_results_event_rank"
  ON "club_meet_results" ("meet_event_id", "rank");

CREATE INDEX IF NOT EXISTS "idx_club_meet_results_meet"
  ON "club_meet_results" ("meet_id");
