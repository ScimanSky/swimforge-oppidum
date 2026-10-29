-- «Efficienza Suprema» rewards a real improvement of the Stroke Index (velocità × distanza per
-- bracciata, Costill et al. 1985): the median of the last 28 days at least 10% above the median
-- of the 90 days before, in the same pool length, with at least 6 swims in each window
-- (criteria type stroke_index_gain, evaluated by server/badge_engine.ts). The old criterion read
-- the invented SEI score, which no longer exists. Users who already have the badge keep it:
-- user_achievement_badges is not touched. Idempotent: safe to run more than once.
UPDATE "achievement_badge_definitions"
SET
  "criteria_type" = 'stroke_index_gain',
  "criteria_json" = '{"metric": "stroke_index", "min_gain_pct": 10, "min_sessions_28d": 6, "min_sessions_baseline": 6}'::jsonb,
  "description" = 'Il tuo Stroke Index (velocità × distanza per bracciata) delle ultime 4 settimane è almeno il 10% sopra la tua media dei 3 mesi precedenti, nella stessa vasca'
WHERE "name" = 'Efficienza Suprema';
--> statement-breakpoint
COMMENT ON COLUMN "achievement_badge_definitions"."criteria_type" IS 'Type of criteria: single_activity, aggregate_total, metric_peak, consistency, stroke_index_gain';
