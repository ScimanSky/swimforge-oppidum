-- Enable Row Level Security on challenges tables
-- Note: Since we use server-side queries with service role key,
-- RLS is enabled but policies allow service role to bypass restrictions.
-- This protects against direct client access while allowing backend operations.

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CHALLENGES TABLE POLICIES
-- ============================================

-- Policy: Allow all operations for service role (backend)
CREATE POLICY "challenges_service_role_all" ON challenges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow read for authenticated users
CREATE POLICY "challenges_read_authenticated" ON challenges
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- CHALLENGE_PARTICIPANTS TABLE POLICIES
-- ============================================

-- Policy: Allow all operations for service role (backend)
CREATE POLICY "challenge_participants_service_role_all" ON challenge_participants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow read for authenticated users
CREATE POLICY "challenge_participants_read_authenticated" ON challenge_participants
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- CHALLENGE_BADGES TABLE POLICIES
-- ============================================

-- Policy: Allow all operations for service role (backend)
CREATE POLICY "challenge_badges_service_role_all" ON challenge_badges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow read for authenticated users
CREATE POLICY "challenge_badges_read_authenticated" ON challenge_badges
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================
-- CHALLENGE_ACTIVITY_LOG TABLE POLICIES
-- ============================================

-- Policy: Allow all operations for service role (backend)
CREATE POLICY "challenge_activity_log_service_role_all" ON challenge_activity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow read for authenticated users
CREATE POLICY "challenge_activity_log_read_authenticated" ON challenge_activity_log
  FOR SELECT
  TO authenticated
  USING (true);
