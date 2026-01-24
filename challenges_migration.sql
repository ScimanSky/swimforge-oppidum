-- ============================================
-- CHALLENGES SYSTEM MIGRATION
-- ============================================

-- Create enums
CREATE TYPE challenge_type AS ENUM ('pool', 'open_water', 'both');
CREATE TYPE challenge_objective AS ENUM ('total_distance', 'total_sessions', 'consistency', 'avg_pace', 'total_time', 'longest_session');
CREATE TYPE challenge_status AS ENUM ('pending', 'active', 'completed', 'cancelled');
CREATE TYPE challenge_duration AS ENUM ('3_days', '1_week', '2_weeks', '1_month');

-- Create challenges table
CREATE TABLE challenges (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type challenge_type NOT NULL,
  objective challenge_objective NOT NULL,
  duration challenge_duration NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status challenge_status DEFAULT 'pending' NOT NULL,
  min_participants INTEGER DEFAULT 2 NOT NULL,
  max_participants INTEGER DEFAULT 10 NOT NULL,
  badge_image_url TEXT,
  badge_name VARCHAR(128),
  prize_description TEXT,
  rules JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create challenge_participants table
CREATE TABLE challenge_participants (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  current_progress INTEGER DEFAULT 0 NOT NULL,
  current_rank INTEGER DEFAULT 0 NOT NULL,
  is_winner BOOLEAN DEFAULT FALSE NOT NULL,
  completed_at TIMESTAMP,
  stats JSONB,
  UNIQUE(challenge_id, user_id)
);

-- Create challenge_badges table
CREATE TABLE challenge_badges (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL UNIQUE REFERENCES challenges(id) ON DELETE CASCADE,
  badge_definition_id INTEGER REFERENCES badge_definitions(id) ON DELETE SET NULL,
  custom_badge_data JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create challenge_activity_log table
CREATE TABLE challenge_activity_log (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES swimming_activities(id) ON DELETE CASCADE,
  contributed_value INTEGER NOT NULL,
  logged_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_challenges_creator ON challenges(creator_id);
CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_challenges_dates ON challenges(start_date, end_date);
CREATE INDEX idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX idx_challenge_activity_log_challenge ON challenge_activity_log(challenge_id);
CREATE INDEX idx_challenge_activity_log_user ON challenge_activity_log(user_id);
CREATE INDEX idx_challenge_activity_log_activity ON challenge_activity_log(activity_id);
