import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, json, serial } from "drizzle-orm/pg-core";

// ============================================
// ENUMS for PostgreSQL
// ============================================
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const strokeTypeEnum = pgEnum("stroke_type", ["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]);
export const badgeCategoryEnum = pgEnum("badge_category", ["distance", "session", "consistency", "open_water", "special", "milestone"]);
export const badgeRarityEnum = pgEnum("badge_rarity", ["common", "uncommon", "rare", "epic", "legendary"]);
export const xpReasonEnum = pgEnum("xp_reason", ["activity", "badge", "bonus", "streak", "record", "level_up"]);

// ============================================
// USERS TABLE (Core auth)
// ============================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).unique(), // Now optional for email/password auth
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash"), // For email/password authentication
  loginMethod: varchar("login_method", { length: 64 }).default("email").notNull(),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

// ============================================
// SWIMMER PROFILES (Extended user data)
// ============================================
export const swimmerProfiles = pgTable("swimmer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  avatarUrl: text("avatar_url"),
  level: integer("level").default(1).notNull(),
  totalXp: integer("total_xp").default(0).notNull(),
  currentLevelXp: integer("current_level_xp").default(0).notNull(),
  totalDistanceMeters: integer("total_distance_meters").default(0).notNull(),
  totalTimeSeconds: integer("total_time_seconds").default(0).notNull(),
  totalSessions: integer("total_sessions").default(0).notNull(),
  totalOpenWaterSessions: integer("total_open_water_sessions").default(0).notNull(),
  totalOpenWaterMeters: integer("total_open_water_meters").default(0).notNull(),
  garminConnected: boolean("garmin_connected").default(false).notNull(),
  garminTokenEncrypted: text("garmin_token_encrypted"),
  garminLastSync: timestamp("garmin_last_sync"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// SWIMMING ACTIVITIES
// ============================================
export const swimmingActivities = pgTable("swimming_activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  garminActivityId: varchar("garmin_activity_id", { length: 64 }),
  activityDate: timestamp("activity_date").notNull(),
  distanceMeters: integer("distance_meters").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  poolLengthMeters: integer("pool_length_meters").default(25),
  strokeType: strokeTypeEnum("stroke_type").default("mixed"),
  avgPacePer100m: integer("avg_pace_per_100m"),
  calories: integer("calories"),
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  avgSwolf: integer("swolf_score"),
  lapsCount: integer("laps_count"),
  avgStrokeDistance: integer("avg_stroke_distance"), // cm per bracciata
  avgStrokes: integer("avg_strokes"), // bracciate per vasca
  avgStrokeCadence: integer("avg_stroke_cadence"), // bracciate per minuto
  trainingEffect: integer("training_effect"), // 0-50 (moltiplicato per 10)
  anaerobicTrainingEffect: integer("anaerobic_training_effect"), // 0-50
  vo2MaxValue: integer("vo2_max_value"), // ml/kg/min
  recoveryTimeHours: integer("recovery_time_hours"), // ore
  restingHeartRate: integer("resting_heart_rate"), // bpm
  avgStress: integer("avg_stress"), // 0-100
  isOpenWater: boolean("is_open_water").default(false).notNull(),
  hrZone1Seconds: integer("hr_zone_1_seconds"),
  hrZone2Seconds: integer("hr_zone_2_seconds"),
  hrZone3Seconds: integer("hr_zone_3_seconds"),
  hrZone4Seconds: integer("hr_zone_4_seconds"),
  hrZone5Seconds: integer("hr_zone_5_seconds"),
  location: text("location"),
  xpEarned: integer("xp_earned").default(0).notNull(),
  notes: text("notes"),
  rawData: json("raw_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// BADGE DEFINITIONS
// ============================================
export const badgeDefinitions = pgTable("badge_definitions", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull(),
  category: badgeCategoryEnum("category").notNull(),
  iconName: varchar("icon_name", { length: 64 }).notNull(),
  colorPrimary: varchar("color_primary", { length: 16 }).default("#1e3a5f"),
  colorSecondary: varchar("color_secondary", { length: 16 }).default("#3b82f6"),
  requirementType: varchar("requirement_type", { length: 64 }).notNull(),
  requirementValue: integer("requirement_value").notNull(),
  requirementExtra: json("requirement_extra"),
  xpReward: integer("xp_reward").default(100).notNull(),
  rarity: badgeRarityEnum("rarity").default("common").notNull(),
  soundEffect: varchar("sound_effect", { length: 64 }).default("badge_unlock"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// USER BADGES (Earned)
// ============================================
export const userBadges = pgTable("user_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  badgeId: integer("badge_id").notNull(),
  earnedAt: timestamp("earned_at").defaultNow().notNull(),
  activityId: integer("activity_id"),
});

// ============================================
// XP TRANSACTIONS (Audit log)
// ============================================
export const xpTransactions = pgTable("xp_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  reason: xpReasonEnum("reason").notNull(),
  referenceId: integer("reference_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// PERSONAL RECORDS
// ============================================
export const personalRecords = pgTable("personal_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  recordType: varchar("record_type", { length: 64 }).notNull(),
  value: integer("value").notNull(),
  strokeType: strokeTypeEnum("stroke_type"),
  activityId: integer("activity_id"),
  achievedAt: timestamp("achieved_at").defaultNow().notNull(),
  previousValue: integer("previous_value"),
});

// ============================================
// LEVEL THRESHOLDS
// ============================================
export const levelThresholds = pgTable("level_thresholds", {
  level: integer("level").primaryKey(),
  xpRequired: integer("xp_required").notNull(),
  title: varchar("title", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).default("#3b82f6"),
});

// ============================================
// GARMIN TOKENS
// ============================================
export const garminTokens = pgTable("garmin_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  garminEmail: varchar("garmin_email", { length: 320 }),
  oauth1Token: text("oauth1_token"),
  oauth2Token: text("oauth2_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// WEEKLY STATS (for tracking weekly goals)
// ============================================
export const weeklyStats = pgTable("weekly_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  weekStart: timestamp("week_start").notNull(),
  sessionsCount: integer("sessions_count").default(0).notNull(),
  totalDistanceMeters: integer("total_distance_meters").default(0).notNull(),
  totalTimeSeconds: integer("total_time_seconds").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// AI INSIGHTS CACHE
// ============================================
export const aiInsightsCache = pgTable("ai_insights_cache", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  insights: text("insights").array().notNull(), // Array of insight strings
  periodDays: integer("period_days").notNull(), // Period used for generating insights (30, 60, 90, etc.)
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Insights expire after 24 hours
});

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SwimmerProfile = typeof swimmerProfiles.$inferSelect;
export type InsertSwimmerProfile = typeof swimmerProfiles.$inferInsert;
export type SwimmingActivity = typeof swimmingActivities.$inferSelect;
export type InsertSwimmingActivity = typeof swimmingActivities.$inferInsert;
export type BadgeDefinition = typeof badgeDefinitions.$inferSelect;
export type InsertBadgeDefinition = typeof badgeDefinitions.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;
export type XpTransaction = typeof xpTransactions.$inferSelect;
export type InsertXpTransaction = typeof xpTransactions.$inferInsert;
export type PersonalRecord = typeof personalRecords.$inferSelect;
export type InsertPersonalRecord = typeof personalRecords.$inferInsert;
export type LevelThreshold = typeof levelThresholds.$inferSelect;
export type WeeklyStats = typeof weeklyStats.$inferSelect;
export type AiInsightsCache = typeof aiInsightsCache.$inferSelect;
export type InsertAiInsightsCache = typeof aiInsightsCache.$inferInsert;
