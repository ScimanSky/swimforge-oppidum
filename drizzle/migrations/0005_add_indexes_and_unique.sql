-- 0005_add_indexes_and_unique.sql
-- Add performance indexes and unique constraints

CREATE INDEX IF NOT EXISTS idx_swimming_activities_user_date ON swimming_activities(user_id, activity_date);

CREATE INDEX IF NOT EXISTS idx_swimming_activities_garmin_id ON swimming_activities(garmin_activity_id) WHERE garmin_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_swimming_activities_strava_id ON swimming_activities(strava_activity_id) WHERE strava_activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_user_created ON social_posts(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_social_posts_club_created ON social_posts(club_id, created_at) WHERE club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON user_notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(sender_id, receiver_id, created_at);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created ON xp_transactions(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_weekly_stats_user_week ON weekly_stats(user_id, week_start);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);

-- Unique constraint on weekly_stats(user_id, week_start)
DO $$ BEGIN
  ALTER TABLE weekly_stats ADD CONSTRAINT uq_weekly_stats_user_week UNIQUE (user_id, week_start);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
