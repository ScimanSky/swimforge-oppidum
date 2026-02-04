ALTER TABLE swimmer_profiles
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS preferred_stroke stroke_type,
  ADD COLUMN IF NOT EXISTS preferred_pool_length_meters integer,
  ADD COLUMN IF NOT EXISTS master_category text;
