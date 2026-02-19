-- Create profile_badges table
CREATE TABLE profile_badges (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  min_xp INTEGER NOT NULL,
  max_xp INTEGER,
  badge_image_url TEXT NOT NULL,
  color VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add profile_badge_id to swimmer_profiles
ALTER TABLE swimmer_profiles 
ADD COLUMN profile_badge_id INTEGER REFERENCES profile_badges(id);

-- Insert profile badges data
INSERT INTO profile_badges (level, name, min_xp, max_xp, badge_image_url, color) VALUES
(1, 'Novizio', 0, 499, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/VFLTPgMPTTJbPuqk.png', '#6B7280'),
(2, 'Principiante', 500, 1499, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/OMMWCZDVTtnDvaRM.png', '#10B981'),
(3, 'Intermedio', 1500, 3499, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/zzKAkUexGlXtUCqM.png', '#3B82F6'),
(4, 'Avanzato', 3500, 6999, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/icWzoQvPHOcONpyB.png', '#8B5CF6'),
(5, 'Esperto', 7000, 11999, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/IIeSzVstowYyDfJg.png', '#F97316'),
(6, 'Maestro', 12000, 19999, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/TQTitouezMBbFQEq.png', '#DC2626'),
(7, 'Leggenda', 20000, NULL, 'https://files.manuscdn.com/user_upload_by_module/session_file/310519663310540862/idLqPvyVwnRCPIhF.png', '#F59E0B');

-- Enable RLS on profile_badges
ALTER TABLE profile_badges ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all to read profile badges
CREATE POLICY "profile_badges_read_all" ON profile_badges
  FOR SELECT
  USING (true);

-- Policy: Service role can manage profile badges
CREATE POLICY "profile_badges_service_role_all" ON profile_badges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
