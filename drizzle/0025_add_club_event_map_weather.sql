-- Club events: route geometry + weather snapshot

ALTER TABLE "club_events"
  ADD COLUMN IF NOT EXISTS "route_geojson" json,
  ADD COLUMN IF NOT EXISTS "route_distance_meters" integer,
  ADD COLUMN IF NOT EXISTS "weather_snapshot" json,
  ADD COLUMN IF NOT EXISTS "weather_fetched_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_club_events_weather_fetched_at"
  ON "club_events"("weather_fetched_at");
