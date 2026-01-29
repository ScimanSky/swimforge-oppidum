-- Remove duplicate user_badges rows before adding unique constraint
DELETE FROM user_badges a
USING user_badges b
WHERE a.user_id = b.user_id
  AND a.badge_id = b.badge_id
  AND a.id > b.id;

-- Enforce unique (user_id, badge_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_user_badge_unique
ON user_badges(user_id, badge_id);
