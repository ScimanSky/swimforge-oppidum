CREATE TABLE IF NOT EXISTS club_pool_workouts (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL,
  session_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  workout_type VARCHAR(20) NOT NULL DEFAULT 'pool',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  directives_json JSONB NOT NULL,
  workout_json JSONB NOT NULL,
  generated_by INTEGER NOT NULL,
  published_by INTEGER,
  published_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_pool_workouts_club_date_status
  ON club_pool_workouts(club_id, session_date, status);

CREATE TABLE IF NOT EXISTS club_pool_workout_runs (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL,
  workout_id INTEGER,
  target_session_date DATE NOT NULL,
  triggered_by INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'gemini',
  model VARCHAR(80),
  prompt_version VARCHAR(32),
  directives_json JSONB NOT NULL,
  raw_response TEXT,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_pool_workout_runs_club_date_created
  ON club_pool_workout_runs(club_id, target_session_date, created_at DESC);
