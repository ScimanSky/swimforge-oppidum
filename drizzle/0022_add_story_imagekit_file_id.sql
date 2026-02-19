-- Track ImageKit file IDs for story media so expired content can be deleted remotely
ALTER TABLE IF EXISTS stories
ADD COLUMN IF NOT EXISTS imagekit_file_id text;

CREATE INDEX IF NOT EXISTS idx_stories_imagekit_file_id
  ON stories (imagekit_file_id);
