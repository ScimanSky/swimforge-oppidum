BEGIN;

-- ---------------------------------------------------------------------------
-- Deduplicate rows before adding new uniqueness constraints.
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, badge_id
      ORDER BY awarded_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM user_achievement_badges
)
DELETE FROM user_achievement_badges uab
USING ranked r
WHERE uab.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, week_start
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM weekly_stats
)
DELETE FROM weekly_stats ws
USING ranked r
WHERE ws.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, record_type, COALESCE(stroke_type::text, '__null__')
      ORDER BY achieved_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM personal_records
)
DELETE FROM personal_records pr
USING ranked r
WHERE pr.id = r.id
  AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- Integrity constraints.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_achievement_badges_user_badge
  ON user_achievement_badges (user_id, badge_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_stats_user_week_start
  ON weekly_stats (user_id, week_start);

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_records_user_record_stroke_nonnull
  ON personal_records (user_id, record_type, stroke_type)
  WHERE stroke_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_records_user_record_stroke_null
  ON personal_records (user_id, record_type)
  WHERE stroke_type IS NULL;

-- ---------------------------------------------------------------------------
-- Performance indexes aligned with social feed and notifications workloads.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_swimming_activities_user_activity_date_desc
  ON swimming_activities (user_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_swimming_activities_garmin_activity_id
  ON swimming_activities (garmin_activity_id);

CREATE INDEX IF NOT EXISTS idx_swimming_activities_strava_activity_id
  ON swimming_activities (strava_activity_id);

CREATE INDEX IF NOT EXISTS idx_social_posts_created_at_desc
  ON social_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_user_id_created_at_desc
  ON social_posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_club_id_created_at_desc
  ON social_posts (club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_is_deleted_created_at_desc
  ON social_posts (is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stories_expires_at
  ON stories (expires_at);

CREATE INDEX IF NOT EXISTS idx_stories_user_created_at_desc
  ON stories (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_follows_following_id
  ON social_follows (following_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver_created_at_desc
  ON direct_messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at_desc
  ON user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created_at_desc
  ON xp_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_records_user_type_stroke
  ON personal_records (user_id, record_type, stroke_type);

COMMIT;
