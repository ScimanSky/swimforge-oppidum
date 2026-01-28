import { eq, desc, and, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { join } from "path";
import { 
  InsertUser, users, User,
  swimmerProfiles, InsertSwimmerProfile,
  swimmingActivities, InsertSwimmingActivity,
  badgeDefinitions, InsertBadgeDefinition,
  userBadges, InsertUserBadge,
  xpTransactions, InsertXpTransaction,
  personalRecords, InsertPersonalRecord,
  levelThresholds,
  weeklyStats
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { updateUserProfileBadge } from './db_profile_badges';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

async function runMigrations(pool: Pool) {
  try {
    console.log("[Database] Running migrations...");
    const migrationPath = join(process.cwd(), "drizzle", "0003_add_advanced_metrics.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");
    await pool.query(migrationSQL);
    console.log("[Database] Migrations completed successfully");
  } catch (error: any) {
    // Ignore errors if columns already exist
    if (error.code === "42701" || error.message?.includes("already exists")) {
      console.log("[Database] Migrations already applied");
    } else {
      console.error("[Database] Migration error:", error);
    }
  }
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      _db = drizzle(_pool);
      
      const shouldRunMigrations =
        process.env.NODE_ENV !== "production" ||
        process.env.RUN_MIGRATIONS === "true";

      if (shouldRunMigrations) {
        // Run migrations on first connection (opt-in in production)
        await runMigrations(_pool);
      } else {
        console.log("[Database] Migrations skipped (set RUN_MIGRATIONS=true to enable)");
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============================================
// USER QUERIES
// ============================================

// Register a new user with email and password
export async function registerUser(email: string, password: string, name?: string): Promise<{ success: boolean; user?: User; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.insert(users).values({
      email,
      passwordHash,
      name: name || email.split('@')[0],
      loginMethod: 'email',
      lastSignedIn: new Date(),
    }).returning();

    if (result.length === 0) {
      return { success: false, error: "Failed to create user" };
    }

    const user = result[0];

    // Create swimmer profile
    await db.insert(swimmerProfiles).values({ userId: user.id });

    // Assign initial profile badge (Novizio - level 1)
    await updateUserProfileBadge(user.id, 0);

    return { success: true, user };
  } catch (error) {
    console.error("[Database] Failed to register user:", error);
    return { success: false, error: "Registration failed" };
  }
}

// Login with email and password
export async function loginUser(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (result.length === 0) {
      return { success: false, error: "Invalid email or password" };
    }

    const user = result[0];
    if (!user.passwordHash) {
      return { success: false, error: "Invalid email or password" };
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    return { success: true, user };
  } catch (error) {
    console.error("[Database] Failed to login user:", error);
    return { success: false, error: "Login failed" };
  }
}

// Get user by ID
export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Legacy: upsert user (for OAuth compatibility)
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { email: user.email || '' };
    const updateSet: Record<string, unknown> = {};

    if (user.openId) values.openId = user.openId;
    if (user.name) {
      values.name = user.name;
      updateSet.name = user.name;
    }
    if (user.loginMethod) {
      values.loginMethod = user.loginMethod;
      updateSet.loginMethod = user.loginMethod;
    }
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert using ON CONFLICT on email
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.email,
      set: updateSet
    });
    
    // Create swimmer profile if not exists
    const existingUser = await db.select().from(users).where(eq(users.email, user.email || '')).limit(1);
    if (existingUser.length > 0) {
      const userId = existingUser[0].id;
      const existingProfile = await db.select().from(swimmerProfiles).where(eq(swimmerProfiles.userId, userId)).limit(1);
      if (existingProfile.length === 0) {
        await db.insert(swimmerProfiles).values({ userId });
      }
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============================================
// SWIMMER PROFILE QUERIES
// ============================================
export async function getSwimmerProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(swimmerProfiles).where(eq(swimmerProfiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateSwimmerProfile(userId: number, data: Partial<InsertSwimmerProfile>) {
  const db = await getDb();
  if (!db) return;
  await db.update(swimmerProfiles).set({ ...data, updatedAt: new Date() }).where(eq(swimmerProfiles.userId, userId));
}

export async function getLeaderboard(orderBy: 'level' | 'totalXp' | 'badges' = 'totalXp', limit: number = 50) {
  console.log('[getLeaderboard] Called with orderBy:', orderBy, 'limit:', limit);
  const db = await getDb();
  if (!db) {
    console.log('[getLeaderboard] DB not available');
    return [];
  }  
  if (orderBy === 'badges') {
    // Use subquery for badge count
    const result = await db.execute(sql`
      SELECT 
        sp.id,
        sp.user_id as "userId",
        sp.level,
        sp.total_xp as "totalXp",
        sp.total_distance_meters as "totalDistanceMeters",
        sp.total_time_seconds as "totalTimeSeconds",
        sp.total_sessions as "totalSessions",
        sp.garmin_connected as "garminConnected",
        sp.created_at as "createdAt",
        sp.updated_at as "updatedAt",
        u.name,
        u.email,
        COALESCE((SELECT COUNT(*) FROM user_badges WHERE user_id = sp.user_id), 0) as "badgeCount"
      FROM swimmer_profiles sp
      JOIN users u ON sp.user_id = u.id
      ORDER BY "badgeCount" DESC, sp.total_xp DESC
      LIMIT ${limit}
    `);
    return result.rows || [];
  }
  
  const orderColumn = orderBy === 'level' ? swimmerProfiles.level : swimmerProfiles.totalXp;
  return await db
    .select({
      profile: swimmerProfiles,
      userName: users.name,
      userEmail: users.email,
    })
    .from(swimmerProfiles)
    .innerJoin(users, eq(swimmerProfiles.userId, users.id))
    .orderBy(desc(orderColumn))
    .limit(limit);
}

// ============================================
// SWIMMING ACTIVITIES QUERIES
// ============================================
export async function createActivity(data: InsertSwimmingActivity) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(swimmingActivities).values(data).returning({ id: swimmingActivities.id });
  return result[0]?.id || null;
}

export async function getActivities(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .orderBy(desc(swimmingActivities.activityDate))
    .limit(limit)
    .offset(offset);
}

export async function getActivityById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(swimmingActivities).where(eq(swimmingActivities.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActivityByGarminId(garminActivityId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(swimmingActivities).where(eq(swimmingActivities.garminActivityId, garminActivityId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateActivity(id: number, data: Partial<InsertSwimmingActivity>) {
  const db = await getDb();
  if (!db) return;
  await db.update(swimmingActivities).set(data).where(eq(swimmingActivities.id, id));
}

// ============================================
// BADGE QUERIES
// ============================================
export async function getAllBadgeDefinitions() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(badgeDefinitions).where(eq(badgeDefinitions.isActive, true)).orderBy(badgeDefinitions.sortOrder);
}

export async function getBadgeDefinitionByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(badgeDefinitions).where(eq(badgeDefinitions.code, code)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserBadges(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      userBadge: userBadges,
      badge: badgeDefinitions,
    })
    .from(userBadges)
    .innerJoin(badgeDefinitions, eq(userBadges.badgeId, badgeDefinitions.id))
    .where(eq(userBadges.userId, userId))
    .orderBy(desc(userBadges.earnedAt));
}

export async function hasUserBadge(userId: number, badgeId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)))
    .limit(1);
  return result.length > 0;
}

export async function awardBadge(data: InsertUserBadge) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(userBadges).values(data).returning({ id: userBadges.id });
  return result[0]?.id || null;
}

export async function createBadgeDefinition(data: InsertBadgeDefinition) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(badgeDefinitions).values(data).returning({ id: badgeDefinitions.id });
  return result[0]?.id || null;
}

export async function getBadgeDefinitionsCount() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(badgeDefinitions);
  return Number(result[0]?.count) || 0;
}

// ============================================
// XP TRANSACTIONS QUERIES
// ============================================
export async function createXpTransaction(data: InsertXpTransaction) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(xpTransactions).values(data).returning({ id: xpTransactions.id });
  return result[0]?.id || null;
}

export async function getXpTransactions(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(xpTransactions)
    .where(eq(xpTransactions.userId, userId))
    .orderBy(desc(xpTransactions.createdAt))
    .limit(limit);
}

// ============================================
// PERSONAL RECORDS QUERIES
// ============================================
export async function getPersonalRecords(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(personalRecords)
    .where(eq(personalRecords.userId, userId))
    .orderBy(desc(personalRecords.achievedAt));
}

export async function getPersonalRecord(userId: number, recordType: string, strokeType?: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  let query = db.select().from(personalRecords).where(
    and(
      eq(personalRecords.userId, userId),
      eq(personalRecords.recordType, recordType)
    )
  );
  
  const result = await query.limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertPersonalRecord(data: InsertPersonalRecord) {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await getPersonalRecord(data.userId, data.recordType, data.strokeType ?? undefined);
  
  if (existing) {
    await db.update(personalRecords).set({
      value: data.value,
      activityId: data.activityId,
      achievedAt: new Date(),
      previousValue: existing.value,
    }).where(eq(personalRecords.id, existing.id));
    return existing.id;
  } else {
    const result = await db.insert(personalRecords).values(data).returning({ id: personalRecords.id });
    return result[0]?.id || null;
  }
}

// ============================================
// LEVEL THRESHOLDS QUERIES
// ============================================
export async function getAllLevelThresholds() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(levelThresholds).orderBy(levelThresholds.level);
}

export async function getLevelForXp(xp: number) {
  const db = await getDb();
  if (!db) return { level: 1, title: 'Novizio', color: '#9ca3af' };
  
  const result = await db
    .select()
    .from(levelThresholds)
    .where(sql`${levelThresholds.xpRequired} <= ${xp}`)
    .orderBy(desc(levelThresholds.level))
    .limit(1);
  
  return result.length > 0 ? result[0] : { level: 1, title: 'Novizio', color: '#9ca3af' };
}

export async function getNextLevelThreshold(currentLevel: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(levelThresholds)
    .where(eq(levelThresholds.level, currentLevel + 1))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function createLevelThreshold(level: number, xpRequired: number, title: string, color: string) {
  const db = await getDb();
  if (!db) return;
  // PostgreSQL upsert
  await db.insert(levelThresholds).values({ level, xpRequired, title, color }).onConflictDoUpdate({
    target: levelThresholds.level,
    set: { xpRequired, title, color }
  });
}

// ============================================
// WEEKLY STATS QUERIES
// ============================================
export async function getWeeklyStats(userId: number, weekStart: Date) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(weeklyStats)
    .where(and(
      eq(weeklyStats.userId, userId),
      eq(weeklyStats.weekStart, weekStart)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function updateWeeklyStats(userId: number, weekStart: Date, sessions: number, distance: number, time: number) {
  const db = await getDb();
  if (!db) return;
  
  const existing = await getWeeklyStats(userId, weekStart);
  
  if (existing) {
    await db.update(weeklyStats).set({
      sessionsCount: existing.sessionsCount + sessions,
      totalDistanceMeters: existing.totalDistanceMeters + distance,
      totalTimeSeconds: existing.totalTimeSeconds + time,
    }).where(eq(weeklyStats.id, existing.id));
  } else {
    await db.insert(weeklyStats).values({
      userId,
      weekStart,
      sessionsCount: sessions,
      totalDistanceMeters: distance,
      totalTimeSeconds: time,
    });
  }
}

// Create OAuth user (Google, etc.)
export async function createOAuthUser(data: {
  email: string;
  name: string | null;
  supabaseId: string;
  loginMethod: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // Create user without password
    const result = await db.insert(users).values({
      email: data.email,
      name: data.name || data.email.split('@')[0],
      openId: data.supabaseId,
      loginMethod: data.loginMethod,
      lastSignedIn: new Date(),
      passwordHash: null, // OAuth users don't have passwords
    }).returning();

    if (result.length === 0) {
      return { success: false, error: "Failed to create OAuth user" };
    }

    const user = result[0];

    // Create swimmer profile
    await db.insert(swimmerProfiles).values({ userId: user.id });

    // Assign initial profile badge (Novizio - level 1)
    await updateUserProfileBadge(user.id, 0);

    return { success: true, user };
  } catch (error) {
    console.error("[Database] Failed to create OAuth user:", error);
    return { success: false, error: "OAuth user creation failed" };
  }
}

// Update user last signed in
export async function updateUserLastSignedIn(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  } catch (error) {
    console.error("[Database] Failed to update last signed in:", error);
  }
}
