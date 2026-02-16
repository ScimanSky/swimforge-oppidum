import { integer, pgEnum, pgTable, text, timestamp, varchar, boolean, json, serial, unique, doublePrecision, date, real } from "drizzle-orm/pg-core";

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
  sessionTokenVersion: integer("session_token_version").default(1).notNull(),
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
  coverUrl: text("cover_url"),
  bio: text("bio"),
  location: text("location"),
  lastName: text("last_name"),
  username: text("username"),
  birthDate: date("birth_date"),
  preferredStroke: strokeTypeEnum("preferred_stroke"),
  preferredPoolLengthMeters: integer("preferred_pool_length_meters"),
  masterCategory: text("master_category"),
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
  lastGarminSyncAt: timestamp("last_garmin_sync_at"),
  stravaConnected: boolean("strava_connected").default(false).notNull(),
  aiSkillLevel: integer("ai_skill_level"),
  aiSkillLabel: text("ai_skill_label"),
  aiSkillConfidence: integer("ai_skill_confidence"),
  aiSkillLastEvaluatedAt: timestamp("ai_skill_last_evaluated_at"),
  aiSkillChange: text("ai_skill_change"),
  aiSkillMessage: text("ai_skill_message"),
  notificationSettings: json("notification_settings"),
  preferences: json("preferences"),
  privacySettings: json("privacy_settings"),
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
  stravaActivityId: varchar("strava_activity_id", { length: 64 }),
  activitySource: varchar("activity_source", { length: 20 }).default("manual"), // 'manual', 'garmin', 'strava'
  activityName: varchar("activity_name", { length: 255 }),
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
  shareToFeed: boolean("share_to_feed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// GHOST CHALLENGES (Club + Feed)
// ============================================
export const ghostChallenges = pgTable("ghost_challenges", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id"),
  challengerUserId: integer("challenger_user_id").notNull(),
  challengerActivityId: integer("challenger_activity_id").notNull(),
  opponentUserId: integer("opponent_user_id").notNull(),
  opponentActivityId: integer("opponent_activity_id").notNull(),
  status: text("status").default("completed").notNull(),
  winnerUserId: integer("winner_user_id"),
  winnerReason: text("winner_reason"),
  challengerDistanceMeters: integer("challenger_distance_meters"),
  challengerDurationSeconds: integer("challenger_duration_seconds"),
  challengerPacePer100m: integer("challenger_pace_per_100m"),
  opponentDistanceMeters: integer("opponent_distance_meters"),
  opponentDurationSeconds: integer("opponent_duration_seconds"),
  opponentPacePer100m: integer("opponent_pace_per_100m"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// GARMIN ACTIVITY LAPS (Detailed splits)
// ============================================
export const garminActivityLaps = pgTable(
  "garmin_activity_laps",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => swimmingActivities.id, { onDelete: "cascade" }),
    lapIndex: integer("lap_index").notNull(),
    distanceMeters: integer("distance_meters"),
    durationSeconds: doublePrecision("duration_seconds"),
    movingDurationSeconds: doublePrecision("moving_duration_seconds"),
    elapsedDurationSeconds: doublePrecision("elapsed_duration_seconds"),
    averageSpeedMps: doublePrecision("average_speed_mps"),
    maxSpeedMps: doublePrecision("max_speed_mps"),
    averageMovingSpeedMps: doublePrecision("average_moving_speed_mps"),
    averageSwolf: integer("average_swolf"),
    averageStrokes: doublePrecision("average_strokes"),
    totalNumberOfStrokes: integer("total_number_of_strokes"),
    averageSwimCadence: integer("average_swim_cadence"),
    calories: integer("calories"),
    avgHeartRate: integer("avg_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    numberOfActiveLengths: integer("number_of_active_lengths"),
    strokeType: text("stroke_type"),
    startTimeGmt: timestamp("start_time_gmt"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    activityLapUnique: unique("garmin_activity_laps_activity_lap_idx").on(
      table.activityId,
      table.lapIndex
    ),
  })
);

// ============================================
// GARMIN ACTIVITY LENGTHS (Per pool length)
// ============================================
export const garminActivityLengths = pgTable(
  "garmin_activity_lengths",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => swimmingActivities.id, { onDelete: "cascade" }),
    lapId: integer("lap_id")
      .notNull()
      .references(() => garminActivityLaps.id, { onDelete: "cascade" }),
    lengthIndex: integer("length_index").notNull(),
    distanceMeters: integer("distance_meters"),
    durationSeconds: doublePrecision("duration_seconds"),
    averageSpeedMps: doublePrecision("average_speed_mps"),
    maxSpeedMps: doublePrecision("max_speed_mps"),
    averageSwolf: integer("average_swolf"),
    totalNumberOfStrokes: integer("total_number_of_strokes"),
    avgHeartRate: integer("avg_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    strokeType: text("stroke_type"),
    startTimeGmt: timestamp("start_time_gmt"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    lapLengthUnique: unique("garmin_activity_lengths_lap_length_idx").on(
      table.lapId,
      table.lengthIndex
    ),
  })
);

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
}, (table) => ({
  userBadgeUnique: unique().on(table.userId, table.badgeId),
}));

// ============================================
// ACHIEVEMENT BADGE DEFINITIONS (Auto-awarded badges)
// ============================================
export const achievementBadgeDefinitions = pgTable("achievement_badge_definitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  iconUrl: varchar("icon_url", { length: 255 }).notNull(),
  criteriaType: varchar("criteria_type", { length: 50 }).notNull(),
  criteriaJson: json("criteria_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// SOCIAL COMMUNITY (Posts / Splashes / Comments / Follows)
// ============================================
export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  activityId: integer("activity_id"),
  clubId: integer("club_id"),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaUrls: text("media_urls").array(),
  taggedUserIds: integer("tagged_user_ids").array(),
  hashtags: text("hashtags").array(),
  visibility: varchar("visibility", { length: 20 }).default("public").notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialSplashes = pgTable("social_splashes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSplash: unique().on(table.postId, table.userId),
}));

export const socialComments = pgTable("social_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const socialFollows = pgTable("social_follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
  status: varchar("status", { length: 20 }).default("accepted").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: unique().on(table.followerId, table.followingId),
}));

export const socialHiddenPosts = pgTable("social_hidden_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  postId: integer("post_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueHiddenPost: unique().on(table.userId, table.postId),
}));

export const socialPostReports = pgTable("social_post_reports", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  reporterUserId: integer("reporter_user_id").notNull(),
  reason: varchar("reason", { length: 30 }).notNull(),
  details: text("details"),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  adminNote: text("admin_note"),
  handledBy: integer("handled_by"),
  handledAt: timestamp("handled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniquePostReporter: unique().on(table.postId, table.reporterUserId),
}));

// ============================================
// STORIES (Ephemeral 24h content)
// ============================================
export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  mediaUrl: text("media_url"),
  imagekitFileId: text("imagekit_file_id"),
  caption: text("caption"),
  type: varchar("type", { length: 10 }).notNull(), // image, video, text
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storyViews = pgTable("story_views", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull(),
  viewerId: integer("viewer_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
}, (table) => ({
  uniqueView: unique().on(table.storyId, table.viewerId),
}));

export const storyReactions = pgTable("story_reactions", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull(),
  userId: integer("user_id").notNull(),
  reactionType: varchar("reaction_type", { length: 20 }).notNull(), // splash, fire, strong, clap, wave
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueStoryReaction: unique().on(table.storyId, table.userId),
}));

// ============================================
// COMMUNITY CLUBS
// ============================================
export const communityClubs = pgTable("community_clubs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  rules: text("rules"),
  coverImageUrl: text("cover_image_url"),
  themeColor: varchar("theme_color", { length: 20 }).default("cyan"),
  logoUrl: text("logo_url"),
  tagline: varchar("tagline", { length: 200 }),
  ownerId: integer("owner_id").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  visibility: varchar("visibility", { length: 20 }).default("public").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueClubName: unique().on(table.name),
}));

export const communityClubMembers = pgTable("community_club_members", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 20 }).default("member").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  uniqueClubMember: unique().on(table.clubId, table.userId),
}));

export const communityClubInvites = pgTable("community_club_invites", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  inviterId: integer("inviter_id").notNull(),
  code: text("code").notNull().unique(),
  role: varchar("role", { length: 20 }).default("member").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  maxUses: integer("max_uses").default(1).notNull(),
  usedCount: integer("used_count").default(0).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// CLUB EVENTS (Allenamenti, gare, eventi sociali)
// ============================================
export const clubEvents = pgTable("club_events", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  creatorId: integer("creator_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 30 }).default("training").notNull(), // training, race, social, meeting
  location: text("location"),
  locationLat: real("location_lat"),
  locationLng: real("location_lng"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  maxAttendees: integer("max_attendees"),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringRule: text("recurring_rule"), // RRULE format per eventi ricorrenti
  coverImageUrl: text("cover_image_url"),
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, cancelled, completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventAttendees = pgTable("event_attendees", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: integer("user_id").notNull(),
  status: varchar("status", { length: 20 }).default("going").notNull(), // going, maybe, not_going
  rsvpAt: timestamp("rsvp_at").defaultNow().notNull(),
}, (table) => ({
  uniqueAttendee: unique().on(table.eventId, table.userId),
}));

// ============================================
// DIRECT MESSAGES (Messaggi tra membri)
// ============================================
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// USER NOTIFICATIONS (Sistema notifiche)
// ============================================
export const userNotifications = pgTable("user_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // post_like, comment, follow, event_invite, dm, badge_earned, etc.
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  link: text("link"), // URL dove portare l'utente
  referenceId: integer("reference_id"), // ID dell'oggetto correlato (post, evento, etc)
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// CLUB ANNOUNCEMENTS (Annunci importanti)
// ============================================
export const clubAnnouncements = pgTable("club_announcements", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  authorId: integer("author_id").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// CLUB MEDIA GALLERY (Foto e video condivisi)
// ============================================
export const clubMedia = pgTable("club_media", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  uploaderId: integer("uploader_id").notNull(),
  mediaType: varchar("media_type", { length: 20 }).notNull(), // image, video
  mediaUrl: text("media_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  caption: text("caption"),
  eventId: integer("event_id"), // Opzionale: collegato ad un evento
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// POST REACTIONS (Reazioni emotive avanzate)
// ============================================
export const postReactions = pgTable("post_reactions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  reactionType: varchar("reaction_type", { length: 20 }).notNull(), // splash, fire, strong, clap, wave
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueReaction: unique().on(table.postId, table.userId),
}));

// ============================================
// USER ACHIEVEMENT BADGES (Earned achievement badges)
// ============================================
export const userAchievementBadges = pgTable("user_achievement_badges", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  badgeId: integer("badge_id").notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
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
// STRAVA TOKENS
// ============================================
export const stravaTokens = pgTable("strava_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: integer("expires_at"), // Unix timestamp
  athleteId: integer("athlete_id"),
  username: varchar("username", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  lastSync: timestamp("last_sync"),
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

// ============================================
// ACTIVITY AI INSIGHTS (single-session analysis)
// ============================================
export const activityAiInsights = pgTable("activity_ai_insights", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  activityId: integer("activity_id").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  bullets: json("bullets").notNull(),
  tags: json("tags").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  seenAt: timestamp("seen_at"),
});

// ============================================
// AI COACH WORKOUTS CACHE
// ============================================
export const aiCoachWorkouts = pgTable("ai_coach_workouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  workoutType: varchar("workout_type", { length: 20 }).notNull(), // 'pool' or 'dryland'
  workoutData: text("workout_data").notNull(), // JSON string containing workout structure
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Workouts expire after 24 hours
}, (table) => {
  return {
    userWorkoutUnique: unique().on(table.userId, table.workoutType),
  };
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
export type ActivityAiInsight = typeof activityAiInsights.$inferSelect;
export type InsertActivityAiInsight = typeof activityAiInsights.$inferInsert;
export type AiCoachWorkout = typeof aiCoachWorkouts.$inferSelect;
export type InsertAiCoachWorkout = typeof aiCoachWorkouts.$inferInsert;
export type Story = typeof stories.$inferSelect;
export type InsertStory = typeof stories.$inferInsert;
export type StoryView = typeof storyViews.$inferSelect;
export type InsertStoryView = typeof storyViews.$inferInsert;
export type StoryReaction = typeof storyReactions.$inferSelect;
export type InsertStoryReaction = typeof storyReactions.$inferInsert;
export type SocialHiddenPost = typeof socialHiddenPosts.$inferSelect;
export type InsertSocialHiddenPost = typeof socialHiddenPosts.$inferInsert;
export type SocialPostReport = typeof socialPostReports.$inferSelect;
export type InsertSocialPostReport = typeof socialPostReports.$inferInsert;
