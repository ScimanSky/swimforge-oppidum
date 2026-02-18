-- Add optional external website URL for community clubs
ALTER TABLE IF EXISTS community_clubs
  ADD COLUMN IF NOT EXISTS website_url text;
