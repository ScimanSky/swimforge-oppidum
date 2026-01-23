-- SwimForge Oppidum - Supabase PostgreSQL Schema
-- Run this script in Supabase SQL Editor to initialize the database

-- ============================================
-- ENUMS
-- ============================================
DO $$ BEGIN
  CREATE TYPE role AS ENUM ('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stroke_type AS ENUM ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE badge_category AS ENUM ('distance', 'session', 'consistency', 'open_water', 'special', 'milestone');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE badge_rarity AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE xp_reason AS ENUM ('activity', 'badge', 'bonus', 'streak', 'record', 'level_up');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  open_id VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  login_method VARCHAR(64),
  role role DEFAULT 'user' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_signed_in TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- SWIMMER PROFILES
-- ============================================
CREATE TABLE IF NOT EXISTS swimmer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  avatar_url TEXT,
  level INTEGER DEFAULT 1 NOT NULL,
  total_xp INTEGER DEFAULT 0 NOT NULL,
  current_level_xp INTEGER DEFAULT 0 NOT NULL,
  total_distance_meters INTEGER DEFAULT 0 NOT NULL,
  total_time_seconds INTEGER DEFAULT 0 NOT NULL,
  total_sessions INTEGER DEFAULT 0 NOT NULL,
  total_open_water_sessions INTEGER DEFAULT 0 NOT NULL,
  total_open_water_meters INTEGER DEFAULT 0 NOT NULL,
  garmin_connected BOOLEAN DEFAULT FALSE NOT NULL,
  garmin_token_encrypted TEXT,
  garmin_last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- SWIMMING ACTIVITIES
-- ============================================
CREATE TABLE IF NOT EXISTS swimming_activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  garmin_activity_id VARCHAR(64),
  activity_date TIMESTAMP NOT NULL,
  distance_meters INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  pool_length_meters INTEGER DEFAULT 25,
  stroke_type stroke_type DEFAULT 'mixed',
  avg_pace_per_100m INTEGER,
  calories INTEGER,
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  swolf_score INTEGER,
  laps_count INTEGER,
  is_open_water BOOLEAN DEFAULT FALSE NOT NULL,
  location TEXT,
  xp_earned INTEGER DEFAULT 0 NOT NULL,
  notes TEXT,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- BADGE DEFINITIONS
-- ============================================
CREATE TABLE IF NOT EXISTS badge_definitions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  category badge_category NOT NULL,
  icon_name VARCHAR(64) NOT NULL,
  color_primary VARCHAR(16) DEFAULT '#1e3a5f',
  color_secondary VARCHAR(16) DEFAULT '#3b82f6',
  requirement_type VARCHAR(64) NOT NULL,
  requirement_value INTEGER NOT NULL,
  requirement_extra JSONB,
  xp_reward INTEGER DEFAULT 100 NOT NULL,
  rarity badge_rarity DEFAULT 'common' NOT NULL,
  sound_effect VARCHAR(64) DEFAULT 'badge_unlock',
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- USER BADGES
-- ============================================
CREATE TABLE IF NOT EXISTS user_badges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  badge_id INTEGER NOT NULL,
  earned_at TIMESTAMP DEFAULT NOW() NOT NULL,
  activity_id INTEGER
);

-- ============================================
-- XP TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS xp_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  reason xp_reason NOT NULL,
  reference_id INTEGER,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- PERSONAL RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS personal_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  record_type VARCHAR(64) NOT NULL,
  value INTEGER NOT NULL,
  stroke_type stroke_type,
  activity_id INTEGER,
  achieved_at TIMESTAMP DEFAULT NOW() NOT NULL,
  previous_value INTEGER
);

-- ============================================
-- LEVEL THRESHOLDS
-- ============================================
CREATE TABLE IF NOT EXISTS level_thresholds (
  level INTEGER PRIMARY KEY,
  xp_required INTEGER NOT NULL,
  title VARCHAR(64) NOT NULL,
  color VARCHAR(16) DEFAULT '#3b82f6'
);

-- ============================================
-- GARMIN TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS garmin_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  garmin_email VARCHAR(320),
  oauth1_token TEXT,
  oauth2_token TEXT,
  token_expires_at TIMESTAMP,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- WEEKLY STATS
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  week_start TIMESTAMP NOT NULL,
  sessions_count INTEGER DEFAULT 0 NOT NULL,
  total_distance_meters INTEGER DEFAULT 0 NOT NULL,
  total_time_seconds INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_swimming_activities_user_id ON swimming_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_swimming_activities_date ON swimming_activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id ON xp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_user_id ON personal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_stats_user_id ON weekly_stats(user_id);

-- ============================================
-- INITIAL DATA: LEVEL THRESHOLDS
-- ============================================
INSERT INTO level_thresholds (level, xp_required, title, color) VALUES
  (1, 0, 'Novizio', '#9ca3af'),
  (2, 500, 'Principiante', '#6b7280'),
  (3, 1200, 'Apprendista', '#22c55e'),
  (4, 2100, 'Nuotatore', '#16a34a'),
  (5, 3200, 'Nuotatore Esperto', '#15803d'),
  (6, 4500, 'Veterano', '#3b82f6'),
  (7, 6000, 'Veterano Esperto', '#2563eb'),
  (8, 7700, 'Elite', '#1d4ed8'),
  (9, 9600, 'Elite Avanzato', '#7c3aed'),
  (10, 11700, 'Maestro', '#6d28d9'),
  (11, 14000, 'Gran Maestro', '#5b21b6'),
  (12, 16500, 'Campione', '#f59e0b'),
  (13, 19200, 'Campione Supremo', '#d97706'),
  (14, 22100, 'Leggenda', '#b45309'),
  (15, 25200, 'Leggenda Vivente', '#ef4444'),
  (16, 28500, 'Mito', '#dc2626'),
  (17, 32000, 'Semidio', '#b91c1c'),
  (18, 35700, 'Titano', '#fbbf24'),
  (19, 39600, 'Olimpico', '#f59e0b'),
  (20, 43700, 'Poseidone', '#eab308')
ON CONFLICT (level) DO UPDATE SET
  xp_required = EXCLUDED.xp_required,
  title = EXCLUDED.title,
  color = EXCLUDED.color;

-- ============================================
-- INITIAL DATA: BADGE DEFINITIONS
-- ============================================
INSERT INTO badge_definitions (code, name, description, category, icon_name, color_primary, color_secondary, requirement_type, requirement_value, xp_reward, rarity, sort_order) VALUES
  -- Distance badges
  ('first_km', 'Primo Chilometro', 'Nuota il tuo primo chilometro totale', 'distance', 'waves', '#1e3a5f', '#3b82f6', 'total_distance_km', 1, 50, 'common', 1),
  ('distance_5km', 'Esploratore', 'Raggiungi 5 km totali', 'distance', 'waves', '#1e3a5f', '#3b82f6', 'total_distance_km', 5, 100, 'common', 2),
  ('distance_10km', 'Navigatore', 'Raggiungi 10 km totali', 'distance', 'waves', '#1e3a5f', '#22c55e', 'total_distance_km', 10, 150, 'uncommon', 3),
  ('distance_25km', 'Maratoneta Acquatico', 'Raggiungi 25 km totali', 'distance', 'waves', '#1e3a5f', '#7c3aed', 'total_distance_km', 25, 250, 'rare', 4),
  ('distance_50km', 'Attraversatore', 'Raggiungi 50 km totali', 'distance', 'waves', '#1e3a5f', '#f59e0b', 'total_distance_km', 50, 400, 'epic', 5),
  ('distance_100km', 'Centurione', 'Raggiungi 100 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 100, 750, 'legendary', 6),
  ('distance_200km', 'Ironswimmer', 'Raggiungi 200 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 200, 1000, 'legendary', 7),
  
  -- Session badges
  ('first_session', 'Prima Bracciata', 'Completa la tua prima sessione', 'session', 'swimmer', '#1e3a5f', '#3b82f6', 'total_sessions', 1, 50, 'common', 10),
  ('sessions_10', 'Costante', 'Completa 10 sessioni', 'session', 'swimmer', '#1e3a5f', '#22c55e', 'total_sessions', 10, 150, 'uncommon', 11),
  ('sessions_25', 'Dedicato', 'Completa 25 sessioni', 'session', 'swimmer', '#1e3a5f', '#7c3aed', 'total_sessions', 25, 300, 'rare', 12),
  ('sessions_50', 'Instancabile', 'Completa 50 sessioni', 'session', 'swimmer', '#1e3a5f', '#f59e0b', 'total_sessions', 50, 500, 'epic', 13),
  ('sessions_100', 'Centenario', 'Completa 100 sessioni', 'session', 'crown', '#1e3a5f', '#eab308', 'total_sessions', 100, 800, 'legendary', 14),
  
  -- Level badges
  ('level_5', 'In Crescita', 'Raggiungi il livello 5', 'milestone', 'star', '#1e3a5f', '#22c55e', 'level', 5, 200, 'uncommon', 20),
  ('level_10', 'Maestro', 'Raggiungi il livello 10', 'milestone', 'star', '#1e3a5f', '#7c3aed', 'level', 10, 400, 'rare', 21),
  ('level_15', 'Leggenda', 'Raggiungi il livello 15', 'milestone', 'crown', '#1e3a5f', '#f59e0b', 'level', 15, 600, 'epic', 22),
  ('level_20', 'Poseidone', 'Raggiungi il livello massimo', 'milestone', 'trident', '#1e3a5f', '#eab308', 'level', 20, 1000, 'legendary', 23),
  
  -- XP badges
  ('xp_1000', 'Collezionista', 'Accumula 1.000 XP', 'milestone', 'diamond', '#1e3a5f', '#3b82f6', 'total_xp', 1000, 100, 'common', 30),
  ('xp_5000', 'Tesaurizzatore', 'Accumula 5.000 XP', 'milestone', 'diamond', '#1e3a5f', '#22c55e', 'total_xp', 5000, 200, 'uncommon', 31),
  ('xp_10000', 'Magnate', 'Accumula 10.000 XP', 'milestone', 'diamond', '#1e3a5f', '#7c3aed', 'total_xp', 10000, 350, 'rare', 32),
  ('xp_25000', 'Tycoon', 'Accumula 25.000 XP', 'milestone', 'diamond', '#1e3a5f', '#f59e0b', 'total_xp', 25000, 500, 'epic', 33),
  ('xp_50000', 'Imperatore', 'Accumula 50.000 XP', 'milestone', 'crown', '#1e3a5f', '#eab308', 'total_xp', 50000, 1000, 'legendary', 34)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon_name = EXCLUDED.icon_name,
  color_primary = EXCLUDED.color_primary,
  color_secondary = EXCLUDED.color_secondary,
  requirement_type = EXCLUDED.requirement_type,
  requirement_value = EXCLUDED.requirement_value,
  xp_reward = EXCLUDED.xp_reward,
  rarity = EXCLUDED.rarity,
  sort_order = EXCLUDED.sort_order;

-- Success message
SELECT 'SwimForge Oppidum database initialized successfully!' as message;
