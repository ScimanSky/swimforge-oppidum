ALTER TABLE swimmer_profiles
  ADD COLUMN IF NOT EXISTS notification_settings JSONB,
  ADD COLUMN IF NOT EXISTS preferences JSONB,
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB;
