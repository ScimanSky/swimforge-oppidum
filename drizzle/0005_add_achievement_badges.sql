-- Create achievement_badge_definitions table to store all available achievement badges
CREATE TABLE "achievement_badge_definitions" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "icon_url" VARCHAR(255) NOT NULL,
  "criteria_type" VARCHAR(50) NOT NULL,
  "criteria_json" JSONB NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_achievement_badges table to track which users have earned which badges
CREATE TABLE "user_achievement_badges" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_id" INTEGER NOT NULL REFERENCES "achievement_badge_definitions"("id") ON DELETE CASCADE,
  "awarded_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "activity_id" INTEGER,
  UNIQUE("user_id", "badge_id")
);

-- Create indexes for performance
CREATE INDEX "idx_user_achievement_badges_user_id" ON "user_achievement_badges"("user_id");
CREATE INDEX "idx_user_achievement_badges_badge_id" ON "user_achievement_badges"("badge_id");

-- Add comments for documentation
COMMENT ON TABLE "achievement_badge_definitions" IS 'Defines all available achievement badges with their criteria';
COMMENT ON TABLE "user_achievement_badges" IS 'Tracks which achievement badges have been awarded to which users';
COMMENT ON COLUMN "achievement_badge_definitions"."criteria_type" IS 'Type of criteria: single_activity, aggregate_total, metric_peak, consistency';
COMMENT ON COLUMN "achievement_badge_definitions"."criteria_json" IS 'JSON object containing the specific criteria parameters';
COMMENT ON COLUMN "user_achievement_badges"."activity_id" IS 'Optional reference to the specific activity that triggered the badge award';

-- Insert initial achievement badge definitions
INSERT INTO "achievement_badge_definitions" ("name", "description", "icon_url", "criteria_type", "criteria_json") VALUES
  ('Maratoneta', 'Nuota almeno 5km in una singola sessione', '/badges_new/marathon.png', 'single_activity', '{"metric": "distance", "operator": ">=", "value": 5000}'),
  ('SWOLF Master', 'Raggiungi un SWOLF di 30 o inferiore', '/badges_new/swolf_master.png', 'single_activity', '{"metric": "swolf_score", "operator": "<=", "value": 30}'),
  ('Centomila', 'Nuota un totale di 100km', '/badges_new/100k.png', 'aggregate_total', '{"metric": "total_distance", "operator": ">=", "value": 100000}'),
  ('Velocista', 'Nuota 100m con un pace inferiore a 1:30/100m (90 secondi)', '/badges_new/sprinter.png', 'single_activity', '{"metric": "avg_pace_per_100m", "operator": "<=", "value": 90}'),
  ('Costanza di Ferro', 'Nuota almeno 3 volte a settimana per 4 settimane consecutive', '/badges_new/consistency.png', 'consistency', '{"min_activities_per_week": 3, "consecutive_weeks": 4}'),
  ('Cardio King', 'Raggiungi una frequenza cardiaca massima di 180 bpm', '/badges_new/cardio.png', 'single_activity', '{"metric": "max_heart_rate", "operator": ">=", "value": 180}'),
  ('Efficienza Suprema', 'Raggiungi un SEI (Swimming Efficiency Index) di 85 o superiore', '/badges_new/efficiency.png', 'metric_peak', '{"metric": "sei", "operator": ">=", "value": 85}'),
  ('Primo Tuffo', 'Completa la tua prima attività di nuoto', '/badges_new/first_swim.png', 'single_activity', '{"metric": "distance", "operator": ">", "value": 0}');
