/**
 * Script to fix database issues after deployment
 * Run with: node --loader tsx server/fix_database.ts
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { updateUserProfileBadge } from "./db_profile_badges";

async function fixDatabase() {
  console.log("🔧 Starting database fix...\n");

  const db = await getDb();
  if (!db) {
    console.error("❌ Database not available");
    return;
  }

  try {
    // 1. Check if ai_insights_cache has period_days column
    console.log("1️⃣ Checking ai_insights_cache table...");
    try {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ai_insights_cache' AND column_name = 'period_days'
      `);
      
      if (result.rows.length === 0) {
        console.log("   ⚠️  Missing period_days column, adding it...");
        await db.execute(sql`
          ALTER TABLE ai_insights_cache 
          ADD COLUMN IF NOT EXISTS period_days integer NOT NULL DEFAULT 30
        `);
        console.log("   ✅ Added period_days column");
      } else {
        console.log("   ✅ period_days column exists");
      }
    } catch (error) {
      console.error("   ❌ Error checking ai_insights_cache:", error);
    }

    // 2. Check if ai_insights_cache has generated_at column
    console.log("\n2️⃣ Checking generated_at column...");
    try {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ai_insights_cache' AND column_name = 'generated_at'
      `);
      
      if (result.rows.length === 0) {
        console.log("   ⚠️  Missing generated_at column, adding it...");
        await db.execute(sql`
          ALTER TABLE ai_insights_cache 
          ADD COLUMN IF NOT EXISTS generated_at timestamp DEFAULT now()
        `);
        console.log("   ✅ Added generated_at column");
      } else {
        console.log("   ✅ generated_at column exists");
      }
    } catch (error) {
      console.error("   ❌ Error checking generated_at:", error);
    }

    // 3. Check if swimmer_profiles has last_garmin_sync_at column
    console.log("\n3️⃣ Checking last_garmin_sync_at column...");
    try {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'swimmer_profiles' AND column_name = 'last_garmin_sync_at'
      `);
      
      if (result.rows.length === 0) {
        console.log("   ⚠️  Missing last_garmin_sync_at column, adding it...");
        await db.execute(sql`
          ALTER TABLE swimmer_profiles 
          ADD COLUMN IF NOT EXISTS last_garmin_sync_at timestamp
        `);
        console.log("   ✅ Added last_garmin_sync_at column");
      } else {
        console.log("   ✅ last_garmin_sync_at column exists");
      }
    } catch (error) {
      console.error("   ❌ Error checking last_garmin_sync_at:", error);
    }

    // 4. Check if achievement badge tables exist
    console.log("\n4️⃣ Checking achievement badge tables...");
    try {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN ('achievement_badge_definitions', 'user_achievement_badges')
      `);
      
      if (result.rows.length < 2) {
        console.log("   ⚠️  Achievement badge tables missing, creating them...");
        
        // Create achievement_badge_definitions table
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS achievement_badge_definitions (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            icon_url VARCHAR(255) NOT NULL,
            criteria_type VARCHAR(50) NOT NULL,
            criteria_json JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create user_achievement_badges table
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS user_achievement_badges (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            badge_id INTEGER NOT NULL REFERENCES achievement_badge_definitions(id) ON DELETE CASCADE,
            awarded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            activity_id INTEGER,
            UNIQUE(user_id, badge_id)
          )
        `);

        // Create indexes
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_user_achievement_badges_user_id 
          ON user_achievement_badges(user_id)
        `);
        await db.execute(sql`
          CREATE INDEX IF NOT EXISTS idx_user_achievement_badges_badge_id 
          ON user_achievement_badges(badge_id)
        `);

        // Insert initial badges
        await db.execute(sql`
          INSERT INTO achievement_badge_definitions (name, description, icon_url, criteria_type, criteria_json) VALUES
          ('Maratoneta', 'Nuota almeno 5km in una singola sessione', '/badges_new/marathon.png', 'single_activity', '{"metric": "distance", "operator": ">=", "value": 5000}'),
          ('SWOLF Master', 'Raggiungi un SWOLF di 30 o inferiore', '/badges_new/swolf_master.png', 'single_activity', '{"metric": "swolf_score", "operator": "<=", "value": 30}'),
          ('Centomila', 'Nuota un totale di 100km', '/badges_new/100k.png', 'aggregate_total', '{"metric": "total_distance", "operator": ">=", "value": 100000}'),
          ('Velocista', 'Nuota 100m con un pace inferiore a 1:30/100m (90 secondi)', '/badges_new/sprinter.png', 'single_activity', '{"metric": "avg_pace_per_100m", "operator": "<=", "value": 90}'),
          ('Costanza di Ferro', 'Nuota almeno 3 volte a settimana per 4 settimane consecutive', '/badges_new/consistency.png', 'consistency', '{"min_activities_per_week": 3, "consecutive_weeks": 4}'),
          ('Cardio King', 'Raggiungi una frequenza cardiaca massima di 180 bpm', '/badges_new/cardio.png', 'single_activity', '{"metric": "max_heart_rate", "operator": ">=", "value": 180}'),
          ('Efficienza Suprema', 'Raggiungi un SEI (Swimming Efficiency Index) di 85 o superiore', '/badges_new/efficiency.png', 'metric_peak', '{"metric": "sei", "operator": ">=", "value": 85}'),
          ('Primo Tuffo', 'Completa la tua prima attività di nuoto', '/badges_new/first_swim.png', 'single_activity', '{"metric": "distance", "operator": ">", "value": 0}')
          ON CONFLICT DO NOTHING
        `);

        console.log("   ✅ Created achievement badge tables");
      } else {
        console.log("   ✅ Achievement badge tables exist");
      }
    } catch (error) {
      console.error("   ❌ Error checking achievement badge tables:", error);
    }

    // 5. Fix profile badges for all users
    console.log("\n5️⃣ Fixing profile badges for all users...");
    try {
      const users = await db.execute(sql`
        SELECT sp.user_id, sp.total_xp, sp.profile_badge_id
        FROM swimmer_profiles sp
      `);

      let fixed = 0;
      for (const user of users.rows as any[]) {
        if (!user.profile_badge_id) {
          await updateUserProfileBadge(user.user_id, user.total_xp || 0);
          fixed++;
        }
      }

      console.log(`   ✅ Fixed ${fixed} user profile badges`);
    } catch (error) {
      console.error("   ❌ Error fixing profile badges:", error);
    }

    console.log("\n✅ Database fix completed!");
  } catch (error) {
    console.error("\n❌ Database fix failed:", error);
  }

  process.exit(0);
}

fixDatabase();
