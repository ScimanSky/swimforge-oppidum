import { eq, desc, and, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { 
  InsertUser, users, 
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

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      _db = drizzle(_pool);
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
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert using ON CONFLICT
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
    
    // Create swimmer profile if not exists
    const existingUser = await db.select().from(users).where(eq(users.openId, user.openId)).limit(1);
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

export async function getLeaderboard(orderBy: 'level' | 'totalXp' | 'badges' = 'totalXp', limit = 50) {
  const db = await getDb();
  if (!db) return [];
  
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
