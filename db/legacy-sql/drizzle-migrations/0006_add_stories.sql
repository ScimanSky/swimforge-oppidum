-- Stories: ephemeral 24h content
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  media_url TEXT,
  caption TEXT,
  type VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_views (
  id SERIAL PRIMARY KEY,
  story_id INTEGER NOT NULL,
  viewer_id INTEGER NOT NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories (user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON story_views (story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON story_views (viewer_id);
