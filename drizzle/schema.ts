import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

// ============================================
// USERS TABLE (Core auth)
// ============================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ============================================
// SWIMMER PROFILES (Extended user data)
// ============================================
export const swimmerProfiles = mysqlTable("swimmer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  avatarUrl: text("avatarUrl"),
  level: int("level").default(1).notNull(),
  totalXp: int("totalXp").default(0).notNull(),
  currentLevelXp: int("currentLevelXp").default(0).notNull(),
  totalDistanceMeters: int("totalDistanceMeters").default(0).notNull(),
  totalTimeSeconds: int("totalTimeSeconds").default(0).notNull(),
  totalSessions: int("totalSessions").default(0).notNull(),
  totalOpenWaterSessions: int("totalOpenWaterSessions").default(0).notNull(),
  totalOpenWaterMeters: int("totalOpenWaterMeters").default(0).notNull(),
  garminConnected: boolean("garminConnected").default(false).notNull(),
  garminTokenEncrypted: text("garminTokenEncrypted"),
  garminLastSync: timestamp("garminLastSync"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// SWIMMING ACTIVITIES
// ============================================
export const swimmingActivities = mysqlTable("swimming_activities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  garminActivityId: varchar("garminActivityId", { length: 64 }),
  activityDate: timestamp("activityDate").notNull(),
  distanceMeters: int("distanceMeters").notNull(),
  durationSeconds: int("durationSeconds").notNull(),
  poolLengthMeters: int("poolLengthMeters").default(25),
  strokeType: mysqlEnum("strokeType", ["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]).default("mixed"),
  avgPacePer100m: int("avgPacePer100m"),
  calories: int("calories"),
  avgHeartRate: int("avgHeartRate"),
  maxHeartRate: int("maxHeartRate"),
  swolfScore: int("swolfScore"),
  lapsCount: int("lapsCount"),
  isOpenWater: boolean("isOpenWater").default(false).notNull(),
  location: text("location"),
  xpEarned: int("xpEarned").default(0).notNull(),
  notes: text("notes"),
  rawData: json("rawData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// BADGE DEFINITIONS
// ============================================
export const badgeDefinitions = mysqlTable("badge_definitions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", ["distance", "session", "consistency", "open_water", "special", "milestone"]).notNull(),
  iconName: varchar("iconName", { length: 64 }).notNull(),
  colorPrimary: varchar("colorPrimary", { length: 16 }).default("#1e3a5f"),
  colorSecondary: varchar("colorSecondary", { length: 16 }).default("#3b82f6"),
  requirementType: varchar("requirementType", { length: 64 }).notNull(),
  requirementValue: int("requirementValue").notNull(),
  requirementExtra: json("requirementExtra"),
  xpReward: int("xpReward").default(100).notNull(),
  rarity: mysqlEnum("rarity", ["common", "uncommon", "rare", "epic", "legendary"]).default("common").notNull(),
  soundEffect: varchar("soundEffect", { length: 64 }).default("badge_unlock"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// USER BADGES (Earned)
// ============================================
export const userBadges = mysqlTable("user_badges", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  badgeId: int("badgeId").notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
  activityId: int("activityId"),
});

// ============================================
// XP TRANSACTIONS (Audit log)
// ============================================
export const xpTransactions = mysqlTable("xp_transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  amount: int("amount").notNull(),
  reason: mysqlEnum("reason", ["activity", "badge", "bonus", "streak", "record", "level_up"]).notNull(),
  referenceId: int("referenceId"),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ============================================
// PERSONAL RECORDS
// ============================================
export const personalRecords = mysqlTable("personal_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  recordType: varchar("recordType", { length: 64 }).notNull(),
  value: int("value").notNull(),
  strokeType: mysqlEnum("strokeType", ["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]),
  activityId: int("activityId"),
  achievedAt: timestamp("achievedAt").defaultNow().notNull(),
  previousValue: int("previousValue"),
});

// ============================================
// LEVEL THRESHOLDS
// ============================================
export const levelThresholds = mysqlTable("level_thresholds", {
  level: int("level").primaryKey(),
  xpRequired: int("xpRequired").notNull(),
  title: varchar("title", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).default("#3b82f6"),
});

// ============================================
// GARMIN TOKENS
// ============================================
export const garminTokens = mysqlTable("garmin_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  garminEmail: varchar("garminEmail", { length: 320 }),
  oauth1Token: text("oauth1Token"),
  oauth2Token: text("oauth2Token"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ============================================
// WEEKLY STATS (for tracking weekly goals)
// ============================================
export const weeklyStats = mysqlTable("weekly_stats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  weekStart: timestamp("weekStart").notNull(),
  sessionsCount: int("sessionsCount").default(0).notNull(),
  totalDistanceMeters: int("totalDistanceMeters").default(0).notNull(),
  totalTimeSeconds: int("totalTimeSeconds").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
