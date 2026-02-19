-- Add club identity fields for dashboard personalization
ALTER TABLE IF EXISTS community_clubs
  ADD COLUMN IF NOT EXISTS theme_color varchar(20) DEFAULT 'cyan',
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS tagline varchar(200);
