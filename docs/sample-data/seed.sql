DO $$
DECLARE demo_user_id INTEGER;
BEGIN
  INSERT INTO users (email, name, login_method, created_at, updated_at, last_signed_in)
  VALUES ('demo@swimforge.local', 'Demo Swimmer', 'demo', NOW(), NOW(), NOW())
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO demo_user_id;

  IF demo_user_id IS NULL THEN
    SELECT id INTO demo_user_id FROM users WHERE email = 'demo@swimforge.local' LIMIT 1;
  END IF;

  INSERT INTO swimmer_profiles (user_id, level, total_xp, current_level_xp, total_distance_meters, total_time_seconds, total_sessions, total_open_water_sessions, total_open_water_meters, garmin_connected, strava_connected, created_at, updated_at)
  VALUES (demo_user_id, 1, 0, 0, 0, 0, 0, 0, 0, false, false, NOW(), NOW())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO swimming_activities (
    user_id, activity_source, activity_name, activity_date,
    distance_meters, duration_seconds, pool_length_meters,
    stroke_type, avg_pace_per_100m, calories,
    avg_heart_rate, max_heart_rate, laps_count,
    is_open_water, created_at
  ) VALUES
  (demo_user_id, 'manual', 'Pool Endurance', NOW() - INTERVAL '3 days', 2500, 1800, 25, 'freestyle', 72, 350, 135, 165, 100, false, NOW()),
  (demo_user_id, 'manual', 'Open Water Tempo', NOW() - INTERVAL '7 days', 1500, 1200, 25, 'mixed', 80, 280, 128, 158, 60, true, NOW())
  ON CONFLICT DO NOTHING;
END $$;
