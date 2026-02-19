CREATE TABLE IF NOT EXISTS ghost_challenges (
  id SERIAL PRIMARY KEY,
  club_id INTEGER,
  challenger_user_id INTEGER NOT NULL,
  challenger_activity_id INTEGER NOT NULL,
  opponent_user_id INTEGER NOT NULL,
  opponent_activity_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  winner_user_id INTEGER,
  winner_reason TEXT,
  challenger_distance_meters INTEGER,
  challenger_duration_seconds INTEGER,
  challenger_pace_per_100m INTEGER,
  opponent_distance_meters INTEGER,
  opponent_duration_seconds INTEGER,
  opponent_pace_per_100m INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ghost_challenges_club_id_fkey FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE SET NULL,
  CONSTRAINT ghost_challenges_challenger_user_id_fkey FOREIGN KEY (challenger_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ghost_challenges_opponent_user_id_fkey FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ghost_challenges_challenger_activity_id_fkey FOREIGN KEY (challenger_activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE,
  CONSTRAINT ghost_challenges_opponent_activity_id_fkey FOREIGN KEY (opponent_activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ghost_challenges_challenger_user_id_idx ON ghost_challenges(challenger_user_id);
CREATE INDEX IF NOT EXISTS ghost_challenges_opponent_user_id_idx ON ghost_challenges(opponent_user_id);
CREATE INDEX IF NOT EXISTS ghost_challenges_club_id_idx ON ghost_challenges(club_id);
CREATE INDEX IF NOT EXISTS ghost_challenges_created_at_idx ON ghost_challenges(created_at);
