-- Recompute every swimmer's level from total_xp against level_thresholds.
--
-- level_thresholds is the only level table: the level is the highest row whose xp_required the
-- total reaches, 1 below the first row (same rule as server/lib/levels.ts). Older code used a
-- hard-coded copy (Garmin sync) and the stored levels may differ from the table.
--
-- Run by hand (psql or the Supabase SQL editor), not a drizzle migration.
-- Idempotent: it only touches rows whose level differs; a second run changes nothing.
-- The app also self-heals a single user on the next Garmin sync or profile read.

-- Preview (read only): who would change.
-- SELECT sp.user_id, sp.total_xp, sp.level AS stored_level,
--        COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1) AS new_level
-- FROM swimmer_profiles sp
-- WHERE sp.level IS DISTINCT FROM
--       COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1)
-- ORDER BY sp.user_id;

BEGIN;

-- Without thresholds everyone would drop to level 1: stop instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM level_thresholds) THEN
    RAISE EXCEPTION 'level_thresholds is empty: no level recomputed';
  END IF;
END $$;

UPDATE swimmer_profiles sp
SET level = COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1),
    updated_at = NOW()
WHERE sp.level IS DISTINCT FROM
      COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1);

COMMIT;

-- Check (read only): must return 0.
-- SELECT count(*) FROM swimmer_profiles sp
-- WHERE sp.level IS DISTINCT FROM
--       COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (sp.total_xp)), 1);
