-- Story reactions (multi-type likes)
CREATE TABLE IF NOT EXISTS story_reactions (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON story_reactions (story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_user_id ON story_reactions (user_id);

DO $$ BEGIN
  ALTER TABLE story_reactions
    ADD CONSTRAINT fk_story_reactions_story_id
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE story_reactions
    ADD CONSTRAINT fk_story_reactions_user_id
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
