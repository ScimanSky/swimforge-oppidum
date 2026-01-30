-- Community clubs + memberships
CREATE TABLE IF NOT EXISTS community_clubs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  cover_image_url TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_club_members (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES community_clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_club_members_club ON community_club_members (club_id);
CREATE INDEX IF NOT EXISTS idx_community_club_members_user ON community_club_members (user_id);
