-- SwimForge 2.0 - Phase 0 Baseline Queries
-- Date: 2026-03-02
-- Scope: D1/D7/D28 baseline + weekly core-loop KPIs
-- Database: PostgreSQL (Supabase)
-- Timezone convention: UTC day boundaries

-- ============================================================
-- 0) Parameters (edit as needed)
-- ============================================================
WITH params AS (
  SELECT
    CURRENT_DATE::date AS as_of_date,
    28::int AS lookback_days,
    84::int AS cohort_lookback_days
)
SELECT * FROM params;

-- ============================================================
-- 1) Canonical active-day signal (for retention)
-- Notes:
-- - product_engagement_events = new instrumentation (Phase 0 onward)
-- - swimming_activities + social_posts = historical fallback signal
-- ============================================================
WITH active_signal AS (
  SELECT
    pe.user_id,
    (pe.created_at AT TIME ZONE 'UTC')::date AS active_day,
    'product_event'::text AS source
  FROM product_engagement_events pe

  UNION ALL

  SELECT
    sa.user_id,
    (sa.activity_date AT TIME ZONE 'UTC')::date AS active_day,
    'swim_activity'::text AS source
  FROM swimming_activities sa

  UNION ALL

  SELECT
    sp.user_id,
    (sp.created_at AT TIME ZONE 'UTC')::date AS active_day,
    'social_post'::text AS source
  FROM social_posts sp
  WHERE sp.is_deleted = false
),
active_days AS (
  SELECT DISTINCT user_id, active_day
  FROM active_signal
)
SELECT
  COUNT(*) AS distinct_user_days,
  COUNT(DISTINCT user_id) AS users_with_activity_signal,
  MIN(active_day) AS first_day,
  MAX(active_day) AS last_day
FROM active_days;

-- ============================================================
-- 2) Retention baseline by registration cohort (D1 / D7 / D28)
-- Output: one row per cohort_day + global weighted row
-- ============================================================
WITH params AS (
  SELECT
    CURRENT_DATE::date AS as_of_date,
    84::int AS cohort_lookback_days
),
active_signal AS (
  SELECT pe.user_id, (pe.created_at AT TIME ZONE 'UTC')::date AS active_day
  FROM product_engagement_events pe
  UNION
  SELECT sa.user_id, (sa.activity_date AT TIME ZONE 'UTC')::date AS active_day
  FROM swimming_activities sa
  UNION
  SELECT sp.user_id, (sp.created_at AT TIME ZONE 'UTC')::date AS active_day
  FROM social_posts sp
  WHERE sp.is_deleted = false
),
cohorts AS (
  SELECT
    u.id AS user_id,
    (u.created_at AT TIME ZONE 'UTC')::date AS cohort_day
  FROM users u
  CROSS JOIN params p
  WHERE (u.created_at AT TIME ZONE 'UTC')::date BETWEEN (p.as_of_date - p.cohort_lookback_days) AND (p.as_of_date - 1)
),
cohort_retention AS (
  SELECT
    c.cohort_day,
    COUNT(*) AS cohort_size,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM active_signal a
        WHERE a.user_id = c.user_id
          AND a.active_day = c.cohort_day + 1
      )
    ) AS retained_d1_exact,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM active_signal a
        WHERE a.user_id = c.user_id
          AND a.active_day = c.cohort_day + 7
      )
    ) AS retained_d7_exact,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM active_signal a
        WHERE a.user_id = c.user_id
          AND a.active_day = c.cohort_day + 28
      )
    ) AS retained_d28_exact,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM active_signal a
        WHERE a.user_id = c.user_id
          AND a.active_day BETWEEN c.cohort_day + 1 AND c.cohort_day + 7
      )
    ) AS retained_d7_rolling,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM active_signal a
        WHERE a.user_id = c.user_id
          AND a.active_day BETWEEN c.cohort_day + 1 AND c.cohort_day + 28
      )
    ) AS retained_d28_rolling
  FROM cohorts c
  GROUP BY c.cohort_day
),
cohort_rates AS (
  SELECT
    cohort_day,
    cohort_size,
    retained_d1_exact,
    retained_d7_exact,
    retained_d28_exact,
    retained_d7_rolling,
    retained_d28_rolling,
    ROUND(100.0 * retained_d1_exact / NULLIF(cohort_size, 0), 2) AS d1_exact_pct,
    ROUND(100.0 * retained_d7_exact / NULLIF(cohort_size, 0), 2) AS d7_exact_pct,
    ROUND(100.0 * retained_d28_exact / NULLIF(cohort_size, 0), 2) AS d28_exact_pct,
    ROUND(100.0 * retained_d7_rolling / NULLIF(cohort_size, 0), 2) AS d7_rolling_pct,
    ROUND(100.0 * retained_d28_rolling / NULLIF(cohort_size, 0), 2) AS d28_rolling_pct
  FROM cohort_retention
),
weighted_summary AS (
  SELECT
    'WEIGHTED_SUMMARY'::text AS cohort_day,
    SUM(cohort_size) AS cohort_size,
    SUM(retained_d1_exact) AS retained_d1_exact,
    SUM(retained_d7_exact) AS retained_d7_exact,
    SUM(retained_d28_exact) AS retained_d28_exact,
    SUM(retained_d7_rolling) AS retained_d7_rolling,
    SUM(retained_d28_rolling) AS retained_d28_rolling,
    ROUND(100.0 * SUM(retained_d1_exact) / NULLIF(SUM(cohort_size), 0), 2) AS d1_exact_pct,
    ROUND(100.0 * SUM(retained_d7_exact) / NULLIF(SUM(cohort_size), 0), 2) AS d7_exact_pct,
    ROUND(100.0 * SUM(retained_d28_exact) / NULLIF(SUM(cohort_size), 0), 2) AS d28_exact_pct,
    ROUND(100.0 * SUM(retained_d7_rolling) / NULLIF(SUM(cohort_size), 0), 2) AS d7_rolling_pct,
    ROUND(100.0 * SUM(retained_d28_rolling) / NULLIF(SUM(cohort_size), 0), 2) AS d28_rolling_pct
  FROM cohort_rates
)
SELECT *
FROM (
  SELECT
    to_char(cohort_day, 'YYYY-MM-DD') AS cohort_day,
    cohort_size,
    retained_d1_exact,
    retained_d7_exact,
    retained_d28_exact,
    retained_d7_rolling,
    retained_d28_rolling,
    d1_exact_pct,
    d7_exact_pct,
    d28_exact_pct,
    d7_rolling_pct,
    d28_rolling_pct
  FROM cohort_rates
  UNION ALL
  SELECT
    cohort_day,
    cohort_size,
    retained_d1_exact,
    retained_d7_exact,
    retained_d28_exact,
    retained_d7_rolling,
    retained_d28_rolling,
    d1_exact_pct,
    d7_exact_pct,
    d28_exact_pct,
    d7_rolling_pct,
    d28_rolling_pct
  FROM weighted_summary
) t
ORDER BY CASE WHEN t.cohort_day = 'WEIGHTED_SUMMARY' THEN 1 ELSE 0 END, t.cohort_day;

-- ============================================================
-- 3) Weekly core-loop KPI snapshot (last 8 weeks)
-- KPIs from Phase 0 spec:
-- - season_view per WAU
-- - CTR season_next_action_click / season_view
-- - % users with >=1 club_workout_open
-- - % users with >=1 club_workout_complete
-- - % users with >=1 ghost_duel_create
-- - % users with >=1 pb_detected
-- ============================================================
WITH weekly_events AS (
  SELECT
    date_trunc('week', pe.created_at AT TIME ZONE 'UTC')::date AS week_start,
    pe.user_id,
    pe.event_name
  FROM product_engagement_events pe
  WHERE (pe.created_at AT TIME ZONE 'UTC')::date >= (CURRENT_DATE - 56)
),
weekly_base AS (
  SELECT
    week_start,
    COUNT(DISTINCT user_id) AS wau,
    COUNT(*) FILTER (WHERE event_name = 'season_view') AS season_views,
    COUNT(*) FILTER (WHERE event_name = 'season_next_action_click') AS season_next_action_clicks,
    COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'club_workout_open') AS users_club_workout_open,
    COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'club_workout_complete') AS users_club_workout_complete,
    COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'ghost_duel_create') AS users_ghost_duel_create,
    COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'pb_detected') AS users_pb_detected
  FROM weekly_events
  GROUP BY week_start
)
SELECT
  week_start,
  wau,
  season_views,
  season_next_action_clicks,
  ROUND(season_views::numeric / NULLIF(wau, 0), 3) AS season_view_per_wau,
  ROUND(100.0 * season_next_action_clicks::numeric / NULLIF(season_views, 0), 2) AS season_next_action_ctr_pct,
  ROUND(100.0 * users_club_workout_open::numeric / NULLIF(wau, 0), 2) AS pct_users_club_workout_open,
  ROUND(100.0 * users_club_workout_complete::numeric / NULLIF(wau, 0), 2) AS pct_users_club_workout_complete,
  ROUND(100.0 * users_ghost_duel_create::numeric / NULLIF(wau, 0), 2) AS pct_users_ghost_duel_create,
  ROUND(100.0 * users_pb_detected::numeric / NULLIF(wau, 0), 2) AS pct_users_pb_detected
FROM weekly_base
ORDER BY week_start DESC;

-- ============================================================
-- 4) Segment breakdown (last 28 days)
-- Segments:
-- - synced_14d: users with >=1 swimming activity in last 14 days
-- - club_member: users in community_club_members status=active
-- - masters: users with master_category on swimmer_profiles
-- ============================================================
WITH active_28d AS (
  SELECT DISTINCT pe.user_id
  FROM product_engagement_events pe
  WHERE (pe.created_at AT TIME ZONE 'UTC')::date >= (CURRENT_DATE - 28)
),
synced_14d AS (
  SELECT DISTINCT sa.user_id
  FROM swimming_activities sa
  WHERE (sa.activity_date AT TIME ZONE 'UTC')::date >= (CURRENT_DATE - 14)
),
club_members AS (
  SELECT DISTINCT ccm.user_id
  FROM community_club_members ccm
  WHERE ccm.status = 'active'
),
masters AS (
  SELECT DISTINCT sp.user_id
  FROM swimmer_profiles sp
  WHERE sp.master_category IS NOT NULL
    AND btrim(sp.master_category) <> ''
),
base AS (
  SELECT
    u.id AS user_id,
    (u.id IN (SELECT user_id FROM active_28d)) AS is_active_28d,
    (u.id IN (SELECT user_id FROM synced_14d)) AS is_synced_14d,
    (u.id IN (SELECT user_id FROM club_members)) AS is_club_member,
    (u.id IN (SELECT user_id FROM masters)) AS is_master
  FROM users u
)
SELECT
  segment,
  users_total,
  users_active_28d,
  ROUND(100.0 * users_active_28d::numeric / NULLIF(users_total, 0), 2) AS active_28d_pct
FROM (
  SELECT
    'all_users'::text AS segment,
    COUNT(*) AS users_total,
    COUNT(*) FILTER (WHERE is_active_28d) AS users_active_28d
  FROM base

  UNION ALL

  SELECT
    'synced_14d',
    COUNT(*) FILTER (WHERE is_synced_14d),
    COUNT(*) FILTER (WHERE is_synced_14d AND is_active_28d)
  FROM base

  UNION ALL

  SELECT
    'club_members',
    COUNT(*) FILTER (WHERE is_club_member),
    COUNT(*) FILTER (WHERE is_club_member AND is_active_28d)
  FROM base

  UNION ALL

  SELECT
    'masters',
    COUNT(*) FILTER (WHERE is_master),
    COUNT(*) FILTER (WHERE is_master AND is_active_28d)
  FROM base

  UNION ALL

  SELECT
    'masters_and_club',
    COUNT(*) FILTER (WHERE is_master AND is_club_member),
    COUNT(*) FILTER (WHERE is_master AND is_club_member AND is_active_28d)
  FROM base
) s
ORDER BY segment;

-- ============================================================
-- 5) Data quality checks for Phase 0 instrumentation
-- ============================================================

-- 5.1 Unknown event names (should be zero)
SELECT
  pe.event_name,
  COUNT(*) AS events
FROM product_engagement_events pe
WHERE pe.event_name NOT IN (
  'season_view',
  'season_next_action_click',
  'pb_detected',
  'ghost_duel_create',
  'ghost_track_open',
  'club_workout_open',
  'club_workout_complete',
  'feed_post_create',
  'feed_post_view',
  'activity_synced',
  'profile_pb_view'
)
GROUP BY pe.event_name
ORDER BY events DESC;

-- 5.2 Daily event volumes by event_name (last 28 days)
SELECT
  (pe.created_at AT TIME ZONE 'UTC')::date AS day,
  pe.event_name,
  COUNT(*) AS events,
  COUNT(DISTINCT pe.user_id) AS users
FROM product_engagement_events pe
WHERE (pe.created_at AT TIME ZONE 'UTC')::date >= (CURRENT_DATE - 28)
GROUP BY day, pe.event_name
ORDER BY day DESC, pe.event_name;

-- 5.3 Null/empty critical fields checks
SELECT
  SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS null_user_id,
  SUM(CASE WHEN event_name IS NULL OR btrim(event_name) = '' THEN 1 ELSE 0 END) AS empty_event_name,
  SUM(CASE WHEN created_at IS NULL THEN 1 ELSE 0 END) AS null_created_at
FROM product_engagement_events;
