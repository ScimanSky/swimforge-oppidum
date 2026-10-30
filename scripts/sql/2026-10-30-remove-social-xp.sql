-- Remove the XP earned from social actions (comments, splashes, reactions, RSVP, club posts),
-- then recompute every level from total_xp against level_thresholds.
-- Owner's decision of 30/10/2026: XP only from swimming, past social XP removed too.
--
-- Run by hand (psql or the Supabase SQL editor), not a drizzle migration, AFTER deploying the
-- code that stops awarding social XP (otherwise new social XP keeps arriving; running this
-- again later removes that too).
--
-- How social XP was recorded (server/xp_actions.ts, before that server/season_engagement.ts,
-- since 12/02/2026): every award is exactly one xp_transactions row with
--   reason = 'bonus' and description = 'action_xp:<YYYY-MM-DD>:<comment|splash|reaction|rsvp|club_post>:<id>'
-- inserted in the same database transaction that added its amount to swimmer_profiles.total_xp.
-- Nothing else writes that prefix. total_xp is NOT rebuilt from xp_transactions: older swim XP
-- may not be in the ledger. Only the recorded social amounts are subtracted.
--
-- Left alone: swim XP (reason 'activity'), badge XP (reason 'badge'), challenge winner XP
-- ('challenge_win:...'), and the XP of the removed season engine ('prediction_xp:...',
-- 'club_quest:...').
--
-- Safe to run twice: the social rows are moved to xp_transactions_social_removed by the same
-- statement that subtracts them, so a second run finds none and subtracts nothing. total_xp never
-- goes below 0.

-- Preview (read only), before running:
-- SELECT split_part(description, ':', 3) AS action, count(*) AS awards, sum(amount) AS xp
-- FROM xp_transactions
-- WHERE reason = 'bonus' AND description LIKE 'action\_xp:%'
-- GROUP BY 1 ORDER BY 1;
--
-- SELECT t.user_id, sum(t.amount) AS social_xp, sp.total_xp,
--        GREATEST(0, sp.total_xp - sum(t.amount)) AS total_xp_after
-- FROM xp_transactions t
-- JOIN swimmer_profiles sp ON sp.user_id = t.user_id
-- WHERE t.reason = 'bonus' AND t.description LIKE 'action\_xp:%'
-- GROUP BY t.user_id, sp.total_xp
-- ORDER BY social_xp DESC;

BEGIN;

-- Without thresholds everyone would drop to level 1: stop before changing anything.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM level_thresholds) THEN
    RAISE EXCEPTION 'level_thresholds is empty: nothing removed';
  END IF;
END $$;

-- The removed rows stay here (same columns as xp_transactions, plus when they were removed).
CREATE TABLE IF NOT EXISTS xp_transactions_social_removed (
  LIKE xp_transactions,
  removed_at timestamp NOT NULL DEFAULT NOW()
);

-- One statement: move the social rows to the archive and subtract them from each user's total.
WITH removed AS (
  DELETE FROM xp_transactions t
  WHERE t.reason = 'bonus'
    AND t.description LIKE 'action\_xp:%'
  RETURNING t.id, t.user_id, t.amount, t.reason, t.reference_id, t.description, t.created_at
),
archived AS (
  INSERT INTO xp_transactions_social_removed (id, user_id, amount, reason, reference_id, description, created_at)
  SELECT id, user_id, amount, reason, reference_id, description, created_at
  FROM removed
  RETURNING user_id, amount
)
UPDATE swimmer_profiles sp
SET total_xp = GREATEST(0, sp.total_xp - per_user.social_xp),
    updated_at = NOW()
FROM (
  SELECT user_id, sum(amount)::int AS social_xp
  FROM archived
  GROUP BY user_id
) AS per_user
WHERE sp.user_id = per_user.user_id;

-- Levels from the new totals (same as scripts/sql/2026-10-30-recompute-levels.sql).
UPDATE swimmer_profiles sp
SET level = COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1),
    updated_at = NOW()
WHERE sp.level IS DISTINCT FROM
      COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1);

COMMIT;

-- Checks (read only), after running:
-- SELECT count(*) FROM xp_transactions WHERE reason = 'bonus' AND description LIKE 'action\_xp:%';  -- 0
-- SELECT user_id, sum(amount) AS removed_xp FROM xp_transactions_social_removed GROUP BY user_id ORDER BY 2 DESC;
--
-- Undo (only if the owner changes their mind; exact unless a total was clamped at 0):
-- BEGIN;
-- WITH restored AS (
--   DELETE FROM xp_transactions_social_removed
--   RETURNING id, user_id, amount, reason, reference_id, description, created_at
-- ), back AS (
--   INSERT INTO xp_transactions (id, user_id, amount, reason, reference_id, description, created_at)
--   SELECT id, user_id, amount, reason, reference_id, description, created_at FROM restored
--   RETURNING user_id, amount
-- )
-- UPDATE swimmer_profiles sp
-- SET total_xp = sp.total_xp + per_user.xp, updated_at = NOW()
-- FROM (SELECT user_id, sum(amount)::int AS xp FROM back GROUP BY user_id) AS per_user
-- WHERE sp.user_id = per_user.user_id;
-- -- then the level recompute above, and COMMIT;
