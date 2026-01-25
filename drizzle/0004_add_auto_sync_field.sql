-- Add last_garmin_sync_at field to track when user last synced with Garmin
ALTER TABLE "swimmer_profiles" ADD COLUMN "last_garmin_sync_at" TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN "swimmer_profiles"."last_garmin_sync_at" IS 'Timestamp of the last successful Garmin activity synchronization';
