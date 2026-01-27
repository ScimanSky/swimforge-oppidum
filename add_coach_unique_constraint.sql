-- Add UNIQUE constraint to ai_coach_workouts table
-- This constraint is required for the ON CONFLICT DO UPDATE clause to work correctly

ALTER TABLE ai_coach_workouts 
ADD CONSTRAINT ai_coach_workouts_user_id_workout_type_unique 
UNIQUE (user_id, workout_type);
