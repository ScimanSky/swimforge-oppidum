import { pgTable, serial, integer, varchar, text, timestamp, boolean, json, pgEnum } from "drizzle-orm/pg-core";

// ============================================
// ENUMS for Challenges
// ============================================
export const challengeTypeEnum = pgEnum("challenge_type", ["pool", "open_water", "both"]);
export const challengeObjectiveEnum = pgEnum("challenge_objective", [
  "total_distance",      // Chi nuota più km
  "total_sessions",      // Chi fa più allenamenti
  "consistency",         // Chi nuota più giorni consecutivi
  "avg_pace",            // Miglior pace medio per 100m
  "total_time",          // Chi accumula più ore in acqua
  "longest_session"      // Record di distanza in una singola sessione
]);
export const challengeStatusEnum = pgEnum("challenge_status", ["pending", "active", "completed", "cancelled"]);
export const challengeDurationEnum = pgEnum("challenge_duration", ["3_days", "1_week", "2_weeks", "1_month"]);

// ============================================
// CHALLENGES TABLE
// ============================================
export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  creatorId: integer("creator_id").notNull(), // User who created the challenge
  type: challengeTypeEnum("type").notNull(), // pool, open_water, both
  objective: challengeObjectiveEnum("objective").notNull(), // What to measure
  duration: challengeDurationEnum("duration").notNull(), // How long
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: challengeStatusEnum("status").default("pending").notNull(),
  minParticipants: integer("min_participants").default(2).notNull(),
  maxParticipants: integer("max_participants").default(10).notNull(),
  badgeImageUrl: text("badge_image_url"), // Custom epic badge for winner
  badgeName: varchar("badge_name", { length: 128 }), // Custom badge name
  prizeDescription: text("prize_description"), // Optional prize description
  rules: json("rules"), // Additional rules/settings
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// CHALLENGE PARTICIPANTS
// ============================================
export const challengeParticipants = pgTable("challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  userId: integer("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  currentProgress: integer("current_progress").default(0).notNull(), // Depends on objective
  currentRank: integer("current_rank").default(0).notNull(), // Live ranking
  isWinner: boolean("is_winner").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  stats: json("stats"), // Detailed stats for this participant
});

// ============================================
// CHALLENGE BADGES (Epic rewards)
// ============================================
export const challengeBadges = pgTable("challenge_badges", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull().unique(),
  badgeDefinitionId: integer("badge_definition_id"), // Link to badge_definitions if created
  customBadgeData: json("custom_badge_data"), // Custom badge metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// CHALLENGE ACTIVITY LOG (Track progress)
// ============================================
export const challengeActivityLog = pgTable("challenge_activity_log", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  userId: integer("user_id").notNull(),
  activityId: integer("activity_id").notNull(), // Link to swimming_activities
  contributedValue: integer("contributed_value").notNull(), // How much this activity contributed
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
});

// Export types
export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = typeof challenges.$inferInsert;
export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type InsertChallengeParticipant = typeof challengeParticipants.$inferInsert;
export type ChallengeBadge = typeof challengeBadges.$inferSelect;
export type InsertChallengeBadge = typeof challengeBadges.$inferInsert;
export type ChallengeActivityLog = typeof challengeActivityLog.$inferSelect;
export type InsertChallengeActivityLog = typeof challengeActivityLog.$inferInsert;
