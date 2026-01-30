ALTER TABLE swimmer_profiles
ADD COLUMN IF NOT EXISTS ai_skill_level integer,
ADD COLUMN IF NOT EXISTS ai_skill_label text,
ADD COLUMN IF NOT EXISTS ai_skill_confidence integer,
ADD COLUMN IF NOT EXISTS ai_skill_last_evaluated_at timestamp,
ADD COLUMN IF NOT EXISTS ai_skill_change text,
ADD COLUMN IF NOT EXISTS ai_skill_message text;
