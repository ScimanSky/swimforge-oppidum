-- ============================================================================
-- SwimForge Database Migration: Performance Indexes
-- ============================================================================
-- 
-- Aggiunge indici critici per migliorare performance query
-- 
-- Esecuzione:
-- 1. Backup database prima di eseguire
-- 2. Esegui questo script su Supabase SQL Editor
-- 3. Verifica che gli indici siano stati creati
-- 4. Testa performance query
--
-- ============================================================================

-- ============================================================================
-- USER BADGES INDEXES
-- ============================================================================

-- Indice per query di badge per utente
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id 
ON user_badges(user_id);

-- Indice composto per query di badge recenti per utente
CREATE INDEX IF NOT EXISTS idx_user_badges_user_date 
ON user_badges(user_id, earned_at DESC);

-- Indice per query di badge per tipo
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id 
ON user_badges(badge_id);

-- ============================================================================
-- SWIMMING ACTIVITIES INDEXES
-- ============================================================================

-- Indice per query di attività per utente e data
CREATE INDEX IF NOT EXISTS idx_swimming_activities_user_date 
ON swimming_activities(user_id, activity_date DESC);

-- Indice per query di attività per tipo di stile
CREATE INDEX IF NOT EXISTS idx_swimming_activities_stroke_type 
ON swimming_activities(stroke_type);

-- Indice per query di attività per fonte (Garmin, Strava)
CREATE INDEX IF NOT EXISTS idx_swimming_activities_source 
ON swimming_activities(source);

-- Indice composto per query di attività per utente e fonte
CREATE INDEX IF NOT EXISTS idx_swimming_activities_user_source 
ON swimming_activities(user_id, source);

-- ============================================================================
-- XP TRANSACTIONS INDEXES
-- ============================================================================

-- Indice per query di transazioni XP per utente
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_id 
ON xp_transactions(user_id);

-- Indice per query di transazioni XP recenti per utente
CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_date 
ON xp_transactions(user_id, created_at DESC);

-- Indice per query di transazioni XP per tipo
CREATE INDEX IF NOT EXISTS idx_xp_transactions_type 
ON xp_transactions(transaction_type);

-- ============================================================================
-- SWIMMER PROFILES INDEXES
-- ============================================================================

-- Indice per query di profili per livello (leaderboard)
CREATE INDEX IF NOT EXISTS idx_swimmer_profiles_level 
ON swimmer_profiles(level DESC);

-- Indice per query di profili per XP totale (leaderboard)
CREATE INDEX IF NOT EXISTS idx_swimmer_profiles_total_xp 
ON swimmer_profiles(total_xp DESC);

-- Indice per query di profili per numero badge
CREATE INDEX IF NOT EXISTS idx_swimmer_profiles_badge_count 
ON swimmer_profiles(badge_count DESC);

-- Indice per query di profili per data creazione
CREATE INDEX IF NOT EXISTS idx_swimmer_profiles_created_at 
ON swimmer_profiles(created_at DESC);

-- ============================================================================
-- AI COACH WORKOUTS INDEXES
-- ============================================================================

-- Indice per query di workout per utente e tipo
CREATE INDEX IF NOT EXISTS idx_ai_coach_workouts_user_type 
ON ai_coach_workouts(user_id, workout_type);

-- Indice per query di workout recenti per utente
CREATE INDEX IF NOT EXISTS idx_ai_coach_workouts_user_date 
ON ai_coach_workouts(user_id, created_at DESC);

-- Indice UNIQUE per prevenire duplicati (se non esiste)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_coach_workouts_unique 
ON ai_coach_workouts(user_id, workout_type, created_at::date);

-- ============================================================================
-- USERS INDEXES
-- ============================================================================

-- Indice per query di utenti per email (login)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Indice per query di utenti per open_id (OAuth)
CREATE INDEX IF NOT EXISTS idx_users_open_id 
ON users(open_id);

-- Indice per query di utenti per data creazione
CREATE INDEX IF NOT EXISTS idx_users_created_at 
ON users(created_at DESC);

-- ============================================================================
-- BADGE DEFINITIONS INDEXES
-- ============================================================================

-- Indice per query di badge per categoria
CREATE INDEX IF NOT EXISTS idx_badge_definitions_category 
ON badge_definitions(category);

-- Indice per query di badge per rarity
CREATE INDEX IF NOT EXISTS idx_badge_definitions_rarity 
ON badge_definitions(rarity);

-- ============================================================================
-- LEADERBOARD OPTIMIZATION
-- ============================================================================

-- Indice per leaderboard XP (top users)
CREATE INDEX IF NOT EXISTS idx_leaderboard_xp 
ON swimmer_profiles(total_xp DESC, user_id);

-- Indice per leaderboard livelli
CREATE INDEX IF NOT EXISTS idx_leaderboard_level 
ON swimmer_profiles(level DESC, total_xp DESC, user_id);

-- Indice per leaderboard badge
CREATE INDEX IF NOT EXISTS idx_leaderboard_badges 
ON swimmer_profiles(badge_count DESC, total_xp DESC, user_id);

-- ============================================================================
-- PARTIAL INDEXES (per query specifiche)
-- ============================================================================

-- Indice per attività recenti (ultimi 30 giorni)
CREATE INDEX IF NOT EXISTS idx_swimming_activities_recent 
ON swimming_activities(user_id, activity_date DESC)
WHERE activity_date > CURRENT_DATE - INTERVAL '30 days';

-- Indice per badge sbloccati (non nulli)
CREATE INDEX IF NOT EXISTS idx_user_badges_earned 
ON user_badges(user_id, earned_at DESC)
WHERE earned_at IS NOT NULL;

-- ============================================================================
-- ANALYZE INDEXES
-- ============================================================================

-- Analizza le tabelle per ottimizzare query planner
ANALYZE users;
ANALYZE swimmer_profiles;
ANALYZE swimming_activities;
ANALYZE user_badges;
ANALYZE xp_transactions;
ANALYZE ai_coach_workouts;
ANALYZE badge_definitions;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verifica che gli indici siano stati creati
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'swimmer_profiles',
    'swimming_activities',
    'user_badges',
    'xp_transactions',
    'ai_coach_workouts',
    'badge_definitions'
  )
ORDER BY tablename, indexname;

-- ============================================================================
-- PERFORMANCE TESTING
-- ============================================================================

-- Test query di leaderboard (dovrebbe essere veloce ora)
-- EXPLAIN ANALYZE
-- SELECT 
--   sp.user_id,
--   sp.total_xp,
--   sp.level,
--   sp.badge_count,
--   u.name,
--   u.email
-- FROM swimmer_profiles sp
-- JOIN users u ON sp.user_id = u.id
-- ORDER BY sp.total_xp DESC
-- LIMIT 100;

-- Test query di attività recenti per utente
-- EXPLAIN ANALYZE
-- SELECT *
-- FROM swimming_activities
-- WHERE user_id = 'user-id-here'
-- ORDER BY activity_date DESC
-- LIMIT 50;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Gli indici migliorano la performance di SELECT ma rallentano INSERT/UPDATE
-- 2. Monitora la dimensione degli indici con:
--    SELECT * FROM pg_stat_user_indexes;
-- 3. Ricostruisci indici se frammentati:
--    REINDEX INDEX idx_name;
-- 4. Elimina indici inutilizzati:
--    DROP INDEX IF EXISTS idx_name;

-- ============================================================================
