CREATE TABLE IF NOT EXISTS community_club_invites (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES community_clubs(id) ON DELETE CASCADE,
  inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role VARCHAR(20) DEFAULT 'member' NOT NULL,
  status VARCHAR(20) DEFAULT 'active' NOT NULL,
  max_uses INTEGER DEFAULT 1 NOT NULL,
  used_count INTEGER DEFAULT 0 NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_club_invites_code ON community_club_invites (code);
CREATE INDEX IF NOT EXISTS idx_community_club_invites_club_id ON community_club_invites (club_id);
