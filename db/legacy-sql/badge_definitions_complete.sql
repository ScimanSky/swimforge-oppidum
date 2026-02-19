-- ============================================
-- COMPLETE BADGE DEFINITIONS (32 BADGES)
-- Run this in Supabase SQL Editor to update all badge definitions
-- ============================================

INSERT INTO badge_definitions (code, name, description, category, icon_name, color_primary, color_secondary, requirement_type, requirement_value, xp_reward, rarity, sort_order) VALUES
  
  -- DISTANCE BADGES (8 total)
  ('dist_1km', 'Primo Chilometro', 'Nuota il tuo primo chilometro totale', 'distance', 'waves', '#1e3a5f', '#3b82f6', 'total_distance_km', 1, 50, 'common', 1),
  ('dist_5km', 'Distanza 5 KM', 'Raggiungi 5 km totali', 'distance', 'waves', '#1e3a5f', '#22c55e', 'total_distance_km', 5, 100, 'uncommon', 2),
  ('dist_10km', 'Centurione', 'Raggiungi 10 km totali', 'distance', 'crown', '#1e3a5f', '#7c3aed', 'total_distance_km', 10, 150, 'rare', 3),
  ('dist_25km', 'Maratoneta in Erba', 'Raggiungi 25 km totali', 'distance', 'waves', '#1e3a5f', '#f59e0b', 'total_distance_km', 25, 250, 'epic', 4),
  ('dist_100km', 'Maratona Acquatica', 'Raggiungi 100 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 100, 500, 'legendary', 5),
  ('dist_250km', 'Traversata Epica', 'Raggiungi 250 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 250, 750, 'legendary', 6),
  ('dist_500km', 'Mezzo Millennio', 'Raggiungi 500 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 500, 1000, 'legendary', 7),
  ('dist_1000km', 'Il Milionario', 'Raggiungi 1000 km totali', 'distance', 'crown', '#1e3a5f', '#eab308', 'total_distance_km', 1000, 2000, 'legendary', 8),
  
  -- SESSION DISTANCE BADGES (4 total)
  ('session_3km', 'Sessione Solida', 'Nuota 3 km in una singola sessione', 'session', 'swimmer', '#1e3a5f', '#3b82f6', 'single_session_distance_km', 3, 100, 'uncommon', 10),
  ('session_4km', 'Resistenza', 'Nuota 4 km in una singola sessione', 'session', 'swimmer', '#1e3a5f', '#22c55e', 'single_session_distance_km', 4, 150, 'rare', 11),
  ('session_5km', 'Ultra Nuotatore', 'Nuota 5 km in una singola sessione', 'session', 'swimmer', '#1e3a5f', '#7c3aed', 'single_session_distance_km', 5, 250, 'epic', 12),
  ('session_6km', 'Macchina Instancabile', 'Nuota 6 km in una singola sessione', 'session', 'crown', '#1e3a5f', '#f59e0b', 'single_session_distance_km', 6, 400, 'legendary', 13),
  
  -- CONSISTENCY BADGES (6 total)
  ('sessions_10', 'Inizio Promettente', 'Completa 10 sessioni totali', 'consistency', 'swimmer', '#1e3a5f', '#3b82f6', 'total_sessions', 10, 100, 'common', 20),
  ('sessions_25', 'Abitudine Sana', 'Completa 25 sessioni totali', 'consistency', 'swimmer', '#1e3a5f', '#22c55e', 'total_sessions', 25, 200, 'uncommon', 21),
  ('sessions_50', 'Mezzo Centinaio', 'Completa 50 sessioni totali', 'consistency', 'swimmer', '#1e3a5f', '#7c3aed', 'total_sessions', 50, 350, 'rare', 22),
  ('sessions_100', 'Centenario', 'Completa 100 sessioni totali', 'consistency', 'crown', '#1e3a5f', '#f59e0b', 'total_sessions', 100, 600, 'epic', 23),
  ('sessions_200', 'Devoto alla Vasca', 'Completa 200 sessioni totali', 'consistency', 'crown', '#1e3a5f', '#eab308', 'total_sessions', 200, 1000, 'legendary', 24),
  ('sessions_365', 'Un Anno in Vasca', 'Completa 365 sessioni totali', 'consistency', 'crown', '#1e3a5f', '#eab308', 'total_sessions', 365, 2000, 'legendary', 25),
  
  -- OPEN WATER BADGES (5 total)
  ('ow_first', 'Battesimo del Mare', 'Completa la tua prima sessione in acque libere', 'open_water', 'waves', '#1e3a5f', '#3b82f6', 'total_open_water_sessions', 1, 150, 'uncommon', 30),
  ('ow_5', 'Navigatore', 'Completa 5 sessioni in acque libere', 'open_water', 'waves', '#1e3a5f', '#22c55e', 'total_open_water_sessions', 5, 300, 'rare', 31),
  ('ow_10', 'Lupo di Mare', 'Completa 10 sessioni in acque libere', 'open_water', 'waves', '#1e3a5f', '#7c3aed', 'total_open_water_sessions', 10, 500, 'epic', 32),
  ('ow_5km', 'Esploratore Marino', 'Nuota 5 km totali in acque libere', 'open_water', 'crown', '#1e3a5f', '#f59e0b', 'total_open_water_distance_km', 5, 400, 'epic', 33),
  ('ow_25km', 'Attraversatore', 'Nuota 25 km totali in acque libere', 'open_water', 'crown', '#1e3a5f', '#eab308', 'total_open_water_distance_km', 25, 1000, 'legendary', 34),
  
  -- SPECIAL BADGES (2 total)
  ('oppidum_member', 'Membro Oppidum', 'Benvenuto nella community Oppidum!', 'special', 'crown', '#1e3a5f', '#7c3aed', 'manual', 1, 500, 'epic', 40),
  ('golden_octopus', 'Polpo d''Oro', 'Badge esclusivo per i membri fondatori', 'special', 'crown', '#1e3a5f', '#eab308', 'manual', 1, 1000, 'legendary', 41),
  
  -- TIME MILESTONE BADGES (3 total)
  ('time_10h', 'Prime 10 Ore', 'Accumula 10 ore di nuoto totali', 'milestone', 'clock', '#1e3a5f', '#3b82f6', 'total_time_hours', 10, 150, 'uncommon', 50),
  ('time_50h', '50 Ore di Dedizione', 'Accumula 50 ore di nuoto totali', 'milestone', 'clock', '#1e3a5f', '#7c3aed', 'total_time_hours', 50, 400, 'epic', 51),
  ('time_100h', 'Centenario del Tempo', 'Accumula 100 ore di nuoto totali', 'milestone', 'crown', '#1e3a5f', '#eab308', 'total_time_hours', 100, 800, 'legendary', 52),
  
  -- LEVEL BADGES (4 total)
  ('level_5', 'Livello 5 Raggiunto', 'Raggiungi il livello 5', 'milestone', 'star', '#1e3a5f', '#22c55e', 'level', 5, 200, 'uncommon', 60),
  ('level_10', 'Livello 10 Raggiunto', 'Raggiungi il livello 10', 'milestone', 'star', '#1e3a5f', '#7c3aed', 'level', 10, 400, 'rare', 61),
  ('level_15', 'Livello 15 Raggiunto', 'Raggiungi il livello 15', 'milestone', 'crown', '#1e3a5f', '#f59e0b', 'level', 15, 600, 'epic', 62),
  ('level_20', 'Poseidone', 'Raggiungi il livello massimo 20', 'milestone', 'trident', '#1e3a5f', '#eab308', 'level', 20, 1000, 'legendary', 63)

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

-- Verify count
SELECT COUNT(*) as total_badges FROM badge_definitions WHERE is_active = true;
