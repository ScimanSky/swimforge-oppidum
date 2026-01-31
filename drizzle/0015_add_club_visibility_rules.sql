ALTER TABLE community_clubs
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public' NOT NULL;

UPDATE community_clubs
SET visibility = CASE
  WHEN is_private = true THEN 'private'
  ELSE 'public'
END
WHERE visibility IS NULL;
