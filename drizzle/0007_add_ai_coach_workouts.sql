-- Migration: Add AI Coach Workouts table
-- Description: Store AI-generated personalized workouts for pool and dryland training

CREATE TABLE IF NOT EXISTS ai_coach_workouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES swimmer_profiles(id) ON DELETE CASCADE,
  workout_type VARCHAR(20) NOT NULL CHECK (workout_type IN ('pool', 'dryland')),
  workout_data JSONB NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  CONSTRAINT unique_user_workout_type UNIQUE (user_id, workout_type)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_coach_workouts_user_id ON ai_coach_workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_coach_workouts_expires_at ON ai_coach_workouts(expires_at);

-- Comment
COMMENT ON TABLE ai_coach_workouts IS 'AI-generated personalized workouts for swimmers';
COMMENT ON COLUMN ai_coach_workouts.workout_type IS 'Type of workout: pool (in water) or dryland (out of water)';
COMMENT ON COLUMN ai_coach_workouts.workout_data IS 'JSON structure containing workout details (exercises, sets, reps, notes)';
COMMENT ON COLUMN ai_coach_workouts.expires_at IS 'Workout cache expiration timestamp (typically 24 hours)';
