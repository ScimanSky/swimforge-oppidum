ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS club_id INTEGER REFERENCES community_clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_social_posts_club_id ON social_posts (club_id);
