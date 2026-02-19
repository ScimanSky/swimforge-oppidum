import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { z } from "zod";
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
import { logger } from "./middleware/logger";
import { classifyAsyncError } from "./lib/withErrorHandling";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
let _dbInitPromise: Promise<ReturnType<typeof drizzle> | null> | null = null;
let _dbCircuitOpenUntil = 0;

export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;

  const now = Date.now();
  if (_dbCircuitOpenUntil && now < _dbCircuitOpenUntil) {
    return null;
  }

  // De-dupe concurrent initializations.
  if (_dbInitPromise) return _dbInitPromise;

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;
  const CIRCUIT_BREAKER_MS = 30_000;

  _dbInitPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      let pool: Pool | null = null;
      try {
        pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          max: 10,
          min: 1,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        });

        // Test connection early to fail fast and avoid half-initialized clients.
        await pool.query("SELECT 1");

        _pool = pool;
        _db = drizzle(_pool);
        _dbCircuitOpenUntil = 0;
        logger.info("[Database] Connected", { event: "db:connected" });
        return _db;
      } catch (error) {
        const { kind, message } = classifyAsyncError(error);
        const retryInMs = BASE_DELAY_MS * attempt;
        logger.warn(`[Database] Connection attempt ${attempt}/${MAX_RETRIES} failed (${kind}): ${message}`, {
          event: "db:connect_retry",
          attempt,
          maxRetries: MAX_RETRIES,
          retryInMs,
          kind,
          message,
        });

        if (pool) {
          try {
            await pool.end();
          } catch {
            // ignore
          }
        }

        if (attempt >= MAX_RETRIES) {
          _dbCircuitOpenUntil = Date.now() + CIRCUIT_BREAKER_MS;
          logger.error("[Database] Max retries reached; opening circuit breaker", {
            event: "db:connect_circuit_open",
            circuitMs: CIRCUIT_BREAKER_MS,
          });
          return null;
        }

        await new Promise((r) => setTimeout(r, retryInMs));
      }
    }

    return null;
  })()
    .finally(() => {
      _dbInitPromise = null;
    });

  return _dbInitPromise;
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
    // Hash password before transaction to keep lock time short.
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await db.transaction(async (tx) => {
      const existing = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        throw new Error("Email already registered");
      }

      const result = await tx.insert(users).values({
        email,
        passwordHash,
        name: name || email.split('@')[0],
        loginMethod: 'email',
        lastSignedIn: new Date(),
      }).returning();

      if (result.length === 0) {
        throw new Error("Failed to create user");
      }

      const createdUser = result[0];
      await tx.insert(swimmerProfiles).values({ userId: createdUser.id });
      return createdUser;
    });

    // Best-effort badge assignment after successful transactional user creation.
    await updateUserProfileBadge(user.id, 0);

    return { success: true, user };
  } catch (error) {
    if (error instanceof Error && error.message === "Email already registered") {
      return { success: false, error: "Email already registered" };
    }
    const { kind, message } = classifyAsyncError(error);
    logger.error(`[Database] Failed to register user (${kind}): ${message}`, {
      event: "auth:register_failed",
      kind,
      message,
    });
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
    const { kind, message } = classifyAsyncError(error);
    logger.error(`[Database] Failed to login user (${kind}): ${message}`, {
      event: "auth:login_failed",
      kind,
      message,
    });
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

export async function updateUser(
  userId: number,
  data: { name?: string | null; email?: string }
) {
  const db = await getDb();
  if (!db) return;
  const updatePayload: Partial<InsertUser> = {};
  if (data.name !== undefined) {
    updatePayload.name = data.name;
  }
  if (data.email !== undefined) {
    updatePayload.email = data.email;
  }
  if (Object.keys(updatePayload).length === 0) return;
  await db.update(users).set(updatePayload).where(eq(users.id, userId));
}

// Legacy: upsert user (for OAuth compatibility)
export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) {
    logger.warn("[Database] Cannot upsert user: database not available", {
      event: "db:upsert_skipped",
    });
    return;
  }

  try {
    await db.transaction(async (tx) => {
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

      const upserted = await tx.insert(users).values(values).onConflictDoUpdate({
        target: users.email,
        set: updateSet,
      }).returning({ id: users.id });

      const userId = upserted[0]?.id;
      if (!userId) {
        throw new Error("Failed to upsert user");
      }

      await tx.insert(swimmerProfiles).values({ userId }).onConflictDoNothing({
        target: swimmerProfiles.userId,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Database] Failed to upsert user: ${message}`, {
      event: "db:upsert_failed",
      message,
    });
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

export async function getLeaderboard(
  orderBy: 'level' | 'totalXp' | 'badges' = 'totalXp',
  limit: number = 50,
  period: 'all' | 'week' | 'month' = 'all'
) {
  const db = await getDb();
  if (!db) {
    return [];
  }  
  // Defense in depth: validate/clamp any values that may originate from client input.
  const orderByValidated = z.enum(["level", "totalXp", "badges"]).safeParse(orderBy).data ?? "totalXp";
  const periodValidated = z.enum(["all", "week", "month"]).safeParse(period).data ?? "all";
  const limitValidated = Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50));

  if (periodValidated === "all") {
    if (orderByValidated === "badges") {
      // Use Drizzle query builder + aggregation to avoid raw SQL string assembly.
      const badgeCountExpr = sql<number>`count(${userBadges.id})`;
      return await db
        .select({
          id: swimmerProfiles.id,
          userId: swimmerProfiles.userId,
          avatarUrl: swimmerProfiles.avatarUrl,
          username: swimmerProfiles.username,
          level: swimmerProfiles.level,
          totalXp: swimmerProfiles.totalXp,
          totalDistanceMeters: swimmerProfiles.totalDistanceMeters,
          totalTimeSeconds: swimmerProfiles.totalTimeSeconds,
          totalSessions: swimmerProfiles.totalSessions,
          garminConnected: swimmerProfiles.garminConnected,
          createdAt: swimmerProfiles.createdAt,
          updatedAt: swimmerProfiles.updatedAt,
          name: users.name,
          email: users.email,
          badgeCount: badgeCountExpr,
        })
        .from(swimmerProfiles)
        .innerJoin(users, eq(swimmerProfiles.userId, users.id))
        .leftJoin(userBadges, eq(userBadges.userId, swimmerProfiles.userId))
        .groupBy(swimmerProfiles.id, users.id)
        .orderBy(desc(badgeCountExpr), desc(swimmerProfiles.totalXp))
        .limit(limitValidated);
    }

    const orderColumn = orderByValidated === "level" ? swimmerProfiles.level : swimmerProfiles.totalXp;
    // Keep existing shape for non-badges "all" (some clients expect entry.profile)
    return await db
      .select({
        profile: swimmerProfiles,
        userName: users.name,
        userEmail: users.email,
      })
      .from(swimmerProfiles)
      .innerJoin(users, eq(swimmerProfiles.userId, users.id))
      .orderBy(desc(orderColumn))
      .limit(limitValidated);
  }

  const now = new Date();
  const startDate = new Date(now);
  if (periodValidated === "week") {
    startDate.setHours(0, 0, 0, 0);
    const dayOfWeek = startDate.getDay();
    const diffFromMonday = (dayOfWeek + 6) % 7;
    startDate.setDate(startDate.getDate() - diffFromMonday);
  }
  if (periodValidated === "month") startDate.setDate(startDate.getDate() - 30);

  const orderBySql =
    orderByValidated === "badges"
      ? sql`"badgeCount" DESC, "periodXp" DESC`
      : orderByValidated === "totalXp"
        ? sql`"periodXp" DESC, sp.total_xp DESC`
        : sql`sp.level DESC, sp.total_xp DESC`;

  const result = await db.execute(sql`
    SELECT 
      sp.id,
      sp.user_id as "userId",
      sp.avatar_url as "avatarUrl",
      sp.username as "username",
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
      COALESCE((SELECT COUNT(*) FROM user_badges WHERE user_id = sp.user_id AND earned_at >= ${startDate}), 0) as "badgeCount",
      COALESCE(
        NULLIF(
          (SELECT SUM(amount) FROM xp_transactions WHERE user_id = sp.user_id AND created_at >= ${startDate}),
          0
        ),
        (SELECT SUM(xp_earned) FROM swimming_activities WHERE user_id = sp.user_id AND activity_date >= ${startDate}),
        0
      ) as "periodXp"
    FROM swimmer_profiles sp
    JOIN users u ON sp.user_id = u.id
    ORDER BY ${orderBySql}
    LIMIT ${limitValidated}
  `);

  return result.rows || [];
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

export async function getActivities(
  userId: number,
  limit = 20,
  offset = 0,
  filters: {
    source?: "all" | "garmin" | "strava" | "manual";
    openWater?: boolean;
    strokeType?: "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed";
    minDistanceMeters?: number;
    maxDistanceMeters?: number;
  } = {}
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(swimmingActivities.userId, userId)];

  if (filters.source && filters.source !== "all") {
    conditions.push(eq(swimmingActivities.activitySource, filters.source));
  }
  if (filters.openWater !== undefined) {
    conditions.push(eq(swimmingActivities.isOpenWater, filters.openWater));
  }
  if (filters.strokeType) {
    conditions.push(eq(swimmingActivities.strokeType, filters.strokeType));
  }
  if (filters.minDistanceMeters !== undefined) {
    conditions.push(gte(swimmingActivities.distanceMeters, filters.minDistanceMeters));
  }
  if (filters.maxDistanceMeters !== undefined) {
    conditions.push(lte(swimmingActivities.distanceMeters, filters.maxDistanceMeters));
  }

  return await db
    .select()
    .from(swimmingActivities)
    .where(and(...conditions))
    .orderBy(desc(swimmingActivities.activityDate))
    .limit(limit)
    .offset(offset);
}

export async function getMaxSessionDistance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({
      maxDistance: sql<number>`coalesce(max(${swimmingActivities.distanceMeters}), 0)`,
    })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId));
  return Number(result[0]?.maxDistance ?? 0);
}

export async function getActivityAggregates(userId: number): Promise<{
  totalDistance: number;
  totalTime: number;
  totalSessions: number;
  totalOpenWaterSessions: number;
  totalOpenWaterMeters: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      totalDistance: 0,
      totalTime: 0,
      totalSessions: 0,
      totalOpenWaterSessions: 0,
      totalOpenWaterMeters: 0,
    };
  }

  const result = await db
    .select({
      totalDistance: sql<number>`coalesce(sum(${swimmingActivities.distanceMeters}), 0)`,
      totalTime: sql<number>`coalesce(sum(${swimmingActivities.durationSeconds}), 0)`,
      totalSessions: sql<number>`count(*)`,
      totalOpenWaterSessions: sql<number>`coalesce(sum(case when ${swimmingActivities.isOpenWater} then 1 else 0 end), 0)`,
      totalOpenWaterMeters: sql<number>`coalesce(sum(case when ${swimmingActivities.isOpenWater} then ${swimmingActivities.distanceMeters} else 0 end), 0)`,
    })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId));

  const row = result[0];
  return {
    totalDistance: Number(row?.totalDistance ?? 0),
    totalTime: Number(row?.totalTime ?? 0),
    totalSessions: Number(row?.totalSessions ?? 0),
    totalOpenWaterSessions: Number(row?.totalOpenWaterSessions ?? 0),
    totalOpenWaterMeters: Number(row?.totalOpenWaterMeters ?? 0),
  };
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
  const result = await db
    .insert(userBadges)
    .values(data)
    .onConflictDoNothing({
      target: [userBadges.userId, userBadges.badgeId],
    })
    .returning({ id: userBadges.id });
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

  const filters = [
    eq(personalRecords.userId, userId),
    eq(personalRecords.recordType, recordType),
    ...(strokeType ? [eq(personalRecords.strokeType, strokeType as any)] : []),
  ];

  const result = await db
    .select()
    .from(personalRecords)
    .where(and(...filters))
    .limit(1);
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

  // Atomic upsert to avoid race conditions on concurrent updates.
  await db
    .insert(weeklyStats)
    .values({
      userId,
      weekStart,
      sessionsCount: sessions,
      totalDistanceMeters: distance,
      totalTimeSeconds: time,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [weeklyStats.userId, weeklyStats.weekStart],
      set: {
        sessionsCount: sql`${weeklyStats.sessionsCount} + ${sessions}`,
        totalDistanceMeters: sql`${weeklyStats.totalDistanceMeters} + ${distance}`,
        totalTimeSeconds: sql`${weeklyStats.totalTimeSeconds} + ${time}`,
        updatedAt: new Date(),
      },
    });
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
    const user = await db.transaction(async (tx) => {
      const result = await tx.insert(users).values({
        email: data.email,
        name: data.name || data.email.split('@')[0],
        openId: data.supabaseId,
        loginMethod: data.loginMethod,
        lastSignedIn: new Date(),
        passwordHash: null, // OAuth users don't have passwords
      }).returning();

      if (result.length === 0) {
        throw new Error("Failed to create OAuth user");
      }

      const createdUser = result[0];
      await tx.insert(swimmerProfiles).values({ userId: createdUser.id });
      return createdUser;
    });

    await updateUserProfileBadge(user.id, 0);

    return { success: true, user };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Database] Failed to create OAuth user: ${message}`, {
      event: "auth:oauth_create_failed",
      message,
    });
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Database] Failed to update last signed in: ${message}`, {
      event: "auth:last_signed_in_update_failed",
      userId,
      message,
    });
  }
}

export async function verifyUserPassword(userId: number, password: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const passwordHash = rows[0]?.passwordHash;
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

export async function incrementSessionTokenVersion(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE users
    SET session_token_version = COALESCE(session_token_version, 1) + 1,
        updated_at = NOW()
    WHERE id = ${userId}
  `);
}

export async function exportUserData(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [
    userResult,
    profileResult,
    activitiesResult,
    socialPostsResult,
    socialCommentsResult,
    socialSplashesResult,
    socialFollowsResult,
    badgesResult,
    xpResult,
    recordsResult,
    weeklyStatsResult,
    storiesResult,
    storyViewsResult,
    notificationsResult,
    directMessagesResult,
    clubsMembershipResult,
    reportsResult,
    hiddenPostsResult,
    consentsResult,
  ] = await Promise.all([
    db.execute(sql`
      SELECT id, open_id, name, email, login_method, role, created_at, updated_at, last_signed_in
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `),
    db.execute(sql`SELECT * FROM swimmer_profiles WHERE user_id = ${userId} LIMIT 1`),
    db.execute(sql`SELECT * FROM swimming_activities WHERE user_id = ${userId} ORDER BY activity_date DESC`),
    db.execute(sql`SELECT * FROM social_posts WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`SELECT * FROM social_comments WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`SELECT * FROM social_splashes WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`
      SELECT *
      FROM social_follows
      WHERE follower_id = ${userId} OR following_id = ${userId}
      ORDER BY created_at DESC
    `),
    db.execute(sql`
      SELECT ub.*, bd.code AS badge_code, bd.name AS badge_name
      FROM user_badges ub
      JOIN badge_definitions bd ON bd.id = ub.badge_id
      WHERE ub.user_id = ${userId}
      ORDER BY ub.earned_at DESC
    `),
    db.execute(sql`SELECT * FROM xp_transactions WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`SELECT * FROM personal_records WHERE user_id = ${userId} ORDER BY achieved_at DESC`),
    db.execute(sql`SELECT * FROM weekly_stats WHERE user_id = ${userId} ORDER BY week_start DESC`),
    db.execute(sql`SELECT * FROM stories WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`SELECT * FROM story_views WHERE viewer_id = ${userId} ORDER BY viewed_at DESC`),
    db.execute(sql`SELECT * FROM user_notifications WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`
      SELECT *
      FROM direct_messages
      WHERE sender_id = ${userId} OR receiver_id = ${userId}
      ORDER BY created_at DESC
    `),
    db.execute(sql`SELECT * FROM community_club_members WHERE user_id = ${userId} ORDER BY joined_at DESC`),
    db.execute(sql`
      SELECT *
      FROM social_post_reports
      WHERE reporter_user_id = ${userId} OR handled_by = ${userId}
      ORDER BY created_at DESC
    `),
    db.execute(sql`SELECT * FROM social_hidden_posts WHERE user_id = ${userId} ORDER BY created_at DESC`),
    db.execute(sql`SELECT * FROM user_consents WHERE user_id = ${userId} ORDER BY created_at DESC`),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: userResult.rows[0] ?? null,
    profile: profileResult.rows[0] ?? null,
    data: {
      activities: activitiesResult.rows,
      socialPosts: socialPostsResult.rows,
      socialComments: socialCommentsResult.rows,
      socialSplashes: socialSplashesResult.rows,
      socialFollows: socialFollowsResult.rows,
      badges: badgesResult.rows,
      xpTransactions: xpResult.rows,
      personalRecords: recordsResult.rows,
      weeklyStats: weeklyStatsResult.rows,
      stories: storiesResult.rows,
      storyViews: storyViewsResult.rows,
      notifications: notificationsResult.rows,
      directMessages: directMessagesResult.rows,
      clubMemberships: clubsMembershipResult.rows,
      reports: reportsResult.rows,
      hiddenPosts: hiddenPostsResult.rows,
      consents: consentsResult.rows,
    },
  };
}

export async function deleteUserAccount(userId: number): Promise<{ id: number; email: string; name: string | null; openId: string | null } | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const userResult = await db.execute(sql`
    SELECT id, email, name, open_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `);
  const user = userResult.rows[0] as
    | { id: number; email: string; name: string | null; open_id: string | null }
    | undefined;

  if (!user) return null;

  const shouldIgnoreMissingRelation = (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const pgError = error as { code?: string };
    return pgError.code === "42P01"; // undefined_table
  };

  // Collect Story ImageKit file IDs before account deletion.
  let storyImageKitFileIds: string[] = [];
  try {
    const storyAssetsResult = await db.execute(sql`
      SELECT imagekit_file_id
      FROM stories
      WHERE user_id = ${userId}
        AND imagekit_file_id IS NOT NULL
        AND imagekit_file_id <> ''
    `);
    storyImageKitFileIds = Array.from(
      new Set(
        storyAssetsResult.rows
          .map((row) => ((row as { imagekit_file_id?: string | null }).imagekit_file_id ?? "").trim())
          .filter((id) => id.length > 0)
      )
    );
  } catch (error) {
    if (!shouldIgnoreMissingRelation(error)) {
      throw error;
    }
  }

  await db.transaction(async (tx) => {
    const deleteIfExists = async (query: ReturnType<typeof sql>) => {
      try {
        await tx.execute(query);
      } catch (error) {
        if (!shouldIgnoreMissingRelation(error)) {
          throw error;
        }
      }
    };

    // Season engagement
    await deleteIfExists(sql`DELETE FROM season_activity_predictions WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM season_club_quest_claims WHERE user_id = ${userId}`);

    // Stories
    await deleteIfExists(sql`
      DELETE FROM story_views
      WHERE viewer_id = ${userId}
         OR story_id IN (SELECT id FROM stories WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM story_reactions
      WHERE user_id = ${userId}
         OR story_id IN (SELECT id FROM stories WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`DELETE FROM stories WHERE user_id = ${userId}`);

    // Social graph and feed
    await deleteIfExists(sql`
      DELETE FROM post_reactions
      WHERE user_id = ${userId}
         OR post_id IN (SELECT id FROM social_posts WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM social_comments
      WHERE user_id = ${userId}
         OR post_id IN (SELECT id FROM social_posts WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM social_splashes
      WHERE user_id = ${userId}
         OR post_id IN (SELECT id FROM social_posts WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM social_hidden_posts
      WHERE user_id = ${userId}
         OR post_id IN (SELECT id FROM social_posts WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM social_post_reports
      WHERE reporter_user_id = ${userId}
         OR handled_by = ${userId}
         OR post_id IN (SELECT id FROM social_posts WHERE user_id = ${userId})
    `);
    await deleteIfExists(sql`
      DELETE FROM social_follows
      WHERE follower_id = ${userId} OR following_id = ${userId}
    `);
    await deleteIfExists(sql`DELETE FROM social_posts WHERE user_id = ${userId}`);

    // Community and messaging
    await deleteIfExists(sql`DELETE FROM direct_messages WHERE sender_id = ${userId} OR receiver_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM user_notifications WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM event_attendees WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM club_announcements WHERE author_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM community_club_members WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM club_media WHERE uploader_id = ${userId}`);

    // Progression and stats
    await deleteIfExists(sql`DELETE FROM user_badges WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM user_achievement_badges WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM personal_records WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM weekly_stats WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM xp_transactions WHERE user_id = ${userId}`);

    // AI artifacts
    await deleteIfExists(sql`DELETE FROM ai_insights_cache WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM activity_ai_insights WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM ai_coach_workouts WHERE user_id = ${userId}`);

    // External sync tokens
    await deleteIfExists(sql`DELETE FROM garmin_tokens WHERE user_id = ${userId}`);
    await deleteIfExists(sql`DELETE FROM strava_tokens WHERE user_id = ${userId}`);

    // Consent audit
    await deleteIfExists(sql`DELETE FROM user_consents WHERE user_id = ${userId}`);

    // Final identity rows
    await deleteIfExists(sql`DELETE FROM swimmer_profiles WHERE user_id = ${userId}`);
    await tx.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  if (storyImageKitFileIds.length > 0) {
    try {
      const { deleteImageKitFileById } = await import("./lib/imagekit");
      const results = await Promise.allSettled(storyImageKitFileIds.map((fileId) => deleteImageKitFileById(fileId)));
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        logger.warn(`[Database] Failed to cleanup ${failed.length}/${storyImageKitFileIds.length} ImageKit files during account deletion`, {
          event: "account:imagekit_cleanup_partial_failure",
          userId,
          failedCount: failed.length,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[Database] ImageKit cleanup after account deletion failed: ${message}`, {
        event: "account:imagekit_cleanup_failed",
        userId,
        message,
      });
    }
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    openId: user.open_id,
  };
}
