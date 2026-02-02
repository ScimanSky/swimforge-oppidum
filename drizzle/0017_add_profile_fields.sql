ALTER TABLE swimmer_profiles
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

ALTER TABLE swimmer_profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE swimmer_profiles
  ADD COLUMN IF NOT EXISTS location TEXT;
