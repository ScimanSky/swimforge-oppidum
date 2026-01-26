-- Migration: Add Strava Integration
-- Created: 2026-01-26
-- Description: Add strava_tokens table and strava-related fields to existing tables

-- ============================================
-- 1. Create strava_tokens table
-- ============================================
CREATE TABLE IF NOT EXISTS "strava_tokens" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL UNIQUE,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" INTEGER, -- Unix timestamp
  "athlete_id" INTEGER,
  "username" VARCHAR(255),
  "display_name" VARCHAR(255),
  "last_sync" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add foreign key constraint
ALTER TABLE "strava_tokens" 
  ADD CONSTRAINT "strava_tokens_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS "strava_tokens_user_id_idx" ON "strava_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "strava_tokens_athlete_id_idx" ON "strava_tokens"("athlete_id");

-- ============================================
-- 2. Add strava_connected to swimmer_profiles
-- ============================================
ALTER TABLE "swimmer_profiles" 
  ADD COLUMN IF NOT EXISTS "strava_connected" BOOLEAN DEFAULT FALSE NOT NULL;

-- ============================================
-- 3. Add Strava fields to swimming_activities
-- ============================================
ALTER TABLE "swimming_activities" 
  ADD COLUMN IF NOT EXISTS "strava_activity_id" VARCHAR(64);

ALTER TABLE "swimming_activities" 
  ADD COLUMN IF NOT EXISTS "activity_source" VARCHAR(20) DEFAULT 'manual';

ALTER TABLE "swimming_activities" 
  ADD COLUMN IF NOT EXISTS "activity_name" VARCHAR(255);

-- Create index for Strava activity ID lookups
CREATE INDEX IF NOT EXISTS "swimming_activities_strava_activity_id_idx" 
  ON "swimming_activities"("strava_activity_id");

-- Create index for activity source filtering
CREATE INDEX IF NOT EXISTS "swimming_activities_activity_source_idx" 
  ON "swimming_activities"("activity_source");

-- ============================================
-- 4. Update existing activities to have activity_source
-- ============================================
-- Set existing Garmin activities
UPDATE "swimming_activities" 
SET "activity_source" = 'garmin' 
WHERE "garmin_activity_id" IS NOT NULL AND "activity_source" = 'manual';

-- Set remaining activities as manual
UPDATE "swimming_activities" 
SET "activity_source" = 'manual' 
WHERE "activity_source" IS NULL;

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE "strava_tokens" IS 'Stores Strava OAuth tokens for connected users';
COMMENT ON COLUMN "strava_tokens"."expires_at" IS 'Unix timestamp when access token expires';
COMMENT ON COLUMN "strava_tokens"."last_sync" IS 'Last time activities were synced from Strava';

COMMENT ON COLUMN "swimmer_profiles"."strava_connected" IS 'Whether user has connected their Strava account';

COMMENT ON COLUMN "swimming_activities"."strava_activity_id" IS 'Strava activity ID if imported from Strava';
COMMENT ON COLUMN "swimming_activities"."activity_source" IS 'Source of activity: manual, garmin, or strava';
COMMENT ON COLUMN "swimming_activities"."activity_name" IS 'Name/title of the activity';
