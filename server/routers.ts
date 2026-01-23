import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as garmin from "./garmin";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Swimmer Profile
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getSwimmerProfile(ctx.user.id);
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
      }
      
      const nextLevel = await db.getNextLevelThreshold(profile.level);
      const currentLevelInfo = await db.getLevelForXp(profile.totalXp);
      
      return {
        ...profile,
        levelTitle: currentLevelInfo.title,
        levelColor: currentLevelInfo.color,
        nextLevelXp: nextLevel?.xpRequired || null,
        xpToNextLevel: nextLevel ? nextLevel.xpRequired - profile.totalXp : 0,
      };
    }),
    
    update: protectedProcedure
      .input(z.object({
        avatarUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateSwimmerProfile(ctx.user.id, input);
        return { success: true };
      }),
  }),

  // Activities
  activities: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getActivities(ctx.user.id, input.limit, input.offset);
      }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const activity = await db.getActivityById(input.id);
        if (!activity || activity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return activity;
      }),
    
    create: protectedProcedure
      .input(z.object({
        activityDate: z.string().transform(s => new Date(s)),
        distanceMeters: z.number().min(0),
        durationSeconds: z.number().min(0),
        poolLengthMeters: z.number().optional(),
        strokeType: z.enum(["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]).optional(),
        avgPacePer100m: z.number().optional(),
        calories: z.number().optional(),
        avgHeartRate: z.number().optional(),
        maxHeartRate: z.number().optional(),
        swolfScore: z.number().optional(),
        lapsCount: z.number().optional(),
        isOpenWater: z.boolean().default(false),
        location: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Calculate XP for this activity
        const baseXp = Math.floor(input.distanceMeters / 100); // 1 XP per 100m
        const sessionBonus = 50; // Bonus for completing a session
        const intensityBonus = input.isOpenWater ? 25 : 0; // Open water bonus
        const totalXp = baseXp + sessionBonus + intensityBonus;
        
        const activityId = await db.createActivity({
          userId: ctx.user.id,
          ...input,
          xpEarned: totalXp,
        });
        
        if (activityId) {
          // Record XP transaction
          await db.createXpTransaction({
            userId: ctx.user.id,
            amount: totalXp,
            reason: "activity",
            referenceId: activityId,
            description: `${input.distanceMeters}m nuotati`,
          });
          
          // Update profile stats
          const profile = await db.getSwimmerProfile(ctx.user.id);
          if (profile) {
            const newTotalXp = profile.totalXp + totalXp;
            const newLevel = await db.getLevelForXp(newTotalXp);
            
            await db.updateSwimmerProfile(ctx.user.id, {
              totalXp: newTotalXp,
              level: newLevel.level,
              totalDistanceMeters: profile.totalDistanceMeters + input.distanceMeters,
              totalTimeSeconds: profile.totalTimeSeconds + input.durationSeconds,
              totalSessions: profile.totalSessions + 1,
              totalOpenWaterSessions: input.isOpenWater ? profile.totalOpenWaterSessions + 1 : profile.totalOpenWaterSessions,
              totalOpenWaterMeters: input.isOpenWater ? profile.totalOpenWaterMeters + input.distanceMeters : profile.totalOpenWaterMeters,
            });
            
            // Check for level up
            if (newLevel.level > profile.level) {
              await db.createXpTransaction({
                userId: ctx.user.id,
                amount: 0,
                reason: "level_up",
                description: `Livello ${newLevel.level} raggiunto: ${newLevel.title}`,
              });
            }
          }
          
          // Check and award badges
          await checkAndAwardBadges(ctx.user.id);
        }
        
        return { id: activityId, xpEarned: totalXp };
      }),
    
    updateNotes: protectedProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const activity = await db.getActivityById(input.id);
        if (!activity || activity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.updateActivity(input.id, { notes: input.notes });
        return { success: true };
      }),
  }),

  // Badges
  badges: router({
    definitions: publicProcedure.query(async () => {
      return await db.getAllBadgeDefinitions();
    }),
    
    userBadges: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserBadges(ctx.user.id);
    }),
    
    progress: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getSwimmerProfile(ctx.user.id);
      const allBadges = await db.getAllBadgeDefinitions();
      const userBadges = await db.getUserBadges(ctx.user.id);
      const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge.id));
      
      return allBadges.map(badge => {
        const earned = earnedBadgeIds.has(badge.id);
        let progress = 0;
        
        if (!earned && profile) {
          switch (badge.requirementType) {
            case "total_distance":
              progress = Math.min(100, (profile.totalDistanceMeters / badge.requirementValue) * 100);
              break;
            case "sessions_count":
              progress = Math.min(100, (profile.totalSessions / badge.requirementValue) * 100);
              break;
            case "total_time":
              progress = Math.min(100, (profile.totalTimeSeconds / badge.requirementValue) * 100);
              break;
            case "open_water_sessions":
              progress = Math.min(100, (profile.totalOpenWaterSessions / badge.requirementValue) * 100);
              break;
            case "open_water_total":
              progress = Math.min(100, (profile.totalOpenWaterMeters / badge.requirementValue) * 100);
              break;
            case "level_reached":
              progress = Math.min(100, (profile.level / badge.requirementValue) * 100);
              break;
          }
        }
        
        return {
          ...badge,
          earned,
          progress: earned ? 100 : Math.floor(progress),
          earnedAt: userBadges.find(ub => ub.badge.id === badge.id)?.userBadge.earnedAt,
        };
      });
    }),
  }),

  // Leaderboard
  leaderboard: router({
    get: protectedProcedure
      .input(z.object({
        orderBy: z.enum(["level", "totalXp", "badges"]).default("totalXp"),
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ input }) => {
        return await db.getLeaderboard(input.orderBy, input.limit);
      }),
  }),

  // Personal Records
  records: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getPersonalRecords(ctx.user.id);
    }),
  }),

  // XP History
  xp: router({
    history: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(async ({ ctx, input }) => {
        return await db.getXpTransactions(ctx.user.id, input.limit);
      }),
  }),

  // Level Thresholds (public for display)
  levels: router({
    all: publicProcedure.query(async () => {
      return await db.getAllLevelThresholds();
    }),
  }),

  // Garmin Integration
  garmin: router({
    status: protectedProcedure.query(async ({ ctx }) => {
      return await garmin.getGarminStatus(ctx.user.id);
    }),
    
    connect: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return await garmin.connectGarmin(ctx.user.id, input.email, input.password);
      }),
    
    // Complete MFA authentication with code from email
    completeMfa: protectedProcedure
      .input(z.object({
        mfaCode: z.string().min(1),
        email: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await garmin.completeMfa(ctx.user.id, input.mfaCode, input.email);
      }),
    
    // Check MFA status
    mfaStatus: protectedProcedure.query(async ({ ctx }) => {
      return await garmin.getMfaStatus(ctx.user.id);
    }),
    
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const success = await garmin.disconnectGarmin(ctx.user.id);
      return { success };
    }),
    
    sync: protectedProcedure
      .input(z.object({ daysBack: z.number().min(1).max(365).default(30) }))
      .mutation(async ({ ctx, input }) => {
        return await garmin.syncGarminActivities(ctx.user.id, input.daysBack);
      }),
  }),

  // Admin: Seed badges and levels
  admin: router({
    seedData: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      
      await seedBadgesAndLevels();
      return { success: true };
    }),
  }),
});

// Helper function to check and award badges
async function checkAndAwardBadges(userId: number) {
  const profile = await db.getSwimmerProfile(userId);
  if (!profile) return;
  
  const allBadges = await db.getAllBadgeDefinitions();
  
  for (const badge of allBadges) {
    const hasBadge = await db.hasUserBadge(userId, badge.id);
    if (hasBadge) continue;
    
    let shouldAward = false;
    
    switch (badge.requirementType) {
      case "total_distance":
        shouldAward = profile.totalDistanceMeters >= badge.requirementValue;
        break;
      case "single_session_distance":
        // This would need to check the latest activity
        break;
      case "sessions_count":
        shouldAward = profile.totalSessions >= badge.requirementValue;
        break;
      case "total_time":
        shouldAward = profile.totalTimeSeconds >= badge.requirementValue;
        break;
      case "open_water_sessions":
        shouldAward = profile.totalOpenWaterSessions >= badge.requirementValue;
        break;
      case "open_water_total":
        shouldAward = profile.totalOpenWaterMeters >= badge.requirementValue;
        break;
      case "level_reached":
        shouldAward = profile.level >= badge.requirementValue;
        break;
      case "special":
        // Special badges are awarded manually or through specific triggers
        break;
    }
    
    if (shouldAward) {
      await db.awardBadge({ userId, badgeId: badge.id });
      await db.createXpTransaction({
        userId,
        amount: badge.xpReward,
        reason: "badge",
        referenceId: badge.id,
        description: `Badge sbloccato: ${badge.name}`,
      });
      
      // Update total XP
      await db.updateSwimmerProfile(userId, {
        totalXp: profile.totalXp + badge.xpReward,
      });
    }
  }
}

// Seed function for badges and levels
async function seedBadgesAndLevels() {
  // Seed level thresholds
  const levels = [
    { level: 1, xp: 0, title: "Novizio", color: "#9ca3af" },
    { level: 2, xp: 500, title: "Apprendista", color: "#9ca3af" },
    { level: 3, xp: 1200, title: "Nuotatore", color: "#22c55e" },
    { level: 4, xp: 2000, title: "Nuotatore Esperto", color: "#22c55e" },
    { level: 5, xp: 3000, title: "Atleta", color: "#3b82f6" },
    { level: 6, xp: 4200, title: "Atleta Avanzato", color: "#3b82f6" },
    { level: 7, xp: 5600, title: "Veterano", color: "#8b5cf6" },
    { level: 8, xp: 7200, title: "Veterano Elite", color: "#8b5cf6" },
    { level: 9, xp: 9000, title: "Maestro", color: "#f59e0b" },
    { level: 10, xp: 11000, title: "Gran Maestro", color: "#f59e0b" },
    { level: 11, xp: 13500, title: "Campione", color: "#ef4444" },
    { level: 12, xp: 16500, title: "Campione Elite", color: "#ef4444" },
    { level: 13, xp: 20000, title: "Leggenda", color: "#ec4899" },
    { level: 14, xp: 24000, title: "Leggenda Vivente", color: "#ec4899" },
    { level: 15, xp: 28500, title: "Mito", color: "#06b6d4" },
    { level: 16, xp: 33500, title: "Mito Immortale", color: "#06b6d4" },
    { level: 17, xp: 39000, title: "Titano", color: "#eab308" },
    { level: 18, xp: 45000, title: "Titano Supremo", color: "#eab308" },
    { level: 19, xp: 52000, title: "Divinità Acquatica", color: "#a855f7" },
    { level: 20, xp: 60000, title: "Poseidone", color: "#1e40af" },
  ];
  
  for (const l of levels) {
    await db.createLevelThreshold(l.level, l.xp, l.title, l.color);
  }
  
  // Check if badges already exist
  const existingCount = await db.getBadgeDefinitionsCount();
  if (existingCount > 0) return;
  
  // Seed badge definitions
  const badges = [
    // Distance badges
    { code: "dist_1km", name: "Primo Chilometro", description: "Hai nuotato il tuo primo chilometro totale", category: "distance", iconName: "trophy", requirementType: "total_distance", requirementValue: 1000, xpReward: 50, rarity: "common", sortOrder: 1 },
    { code: "dist_10km", name: "Maratoneta in Erba", description: "Hai raggiunto 10 km totali", category: "distance", iconName: "medal", requirementType: "total_distance", requirementValue: 10000, xpReward: 100, rarity: "common", sortOrder: 2 },
    { code: "dist_42km", name: "Maratona Acquatica", description: "Hai nuotato una maratona (42.195 km)", category: "distance", iconName: "award", requirementType: "total_distance", requirementValue: 42195, xpReward: 250, rarity: "uncommon", sortOrder: 3 },
    { code: "dist_100km", name: "Centurione", description: "Hai superato i 100 km totali", category: "distance", iconName: "star", requirementType: "total_distance", requirementValue: 100000, xpReward: 500, rarity: "rare", sortOrder: 4 },
    { code: "dist_250km", name: "Traversata Epica", description: "Hai nuotato 250 km totali", category: "distance", iconName: "crown", requirementType: "total_distance", requirementValue: 250000, xpReward: 1000, rarity: "epic", sortOrder: 5 },
    { code: "dist_500km", name: "Mezzo Millennio", description: "Hai raggiunto 500 km totali", category: "distance", iconName: "gem", requirementType: "total_distance", requirementValue: 500000, xpReward: 2000, rarity: "epic", sortOrder: 6 },
    { code: "dist_1000km", name: "Il Milionario", description: "Un milione di metri nuotati!", category: "distance", iconName: "diamond", requirementType: "total_distance", requirementValue: 1000000, xpReward: 5000, rarity: "legendary", sortOrder: 7 },
    
    // Session distance badges
    { code: "session_3km", name: "Sessione Solida", description: "Hai nuotato 3 km in una singola sessione", category: "session", iconName: "flame", requirementType: "single_session_distance", requirementValue: 3000, xpReward: 75, rarity: "common", sortOrder: 10 },
    { code: "session_4km", name: "Resistenza", description: "Hai nuotato 4 km in una singola sessione", category: "session", iconName: "zap", requirementType: "single_session_distance", requirementValue: 4000, xpReward: 150, rarity: "uncommon", sortOrder: 11 },
    { code: "session_5km", name: "Ultra Nuotatore", description: "Hai nuotato 5 km in una singola sessione", category: "session", iconName: "rocket", requirementType: "single_session_distance", requirementValue: 5000, xpReward: 300, rarity: "rare", sortOrder: 12 },
    { code: "session_6km", name: "Macchina Instancabile", description: "6 km in una sessione? Sei una macchina!", category: "session", iconName: "battery", requirementType: "single_session_distance", requirementValue: 6000, xpReward: 500, rarity: "epic", sortOrder: 13 },
    
    // Consistency badges
    { code: "sessions_10", name: "Inizio Promettente", description: "Hai completato 10 sessioni di allenamento", category: "consistency", iconName: "calendar", requirementType: "sessions_count", requirementValue: 10, xpReward: 100, rarity: "common", sortOrder: 20 },
    { code: "sessions_25", name: "Abitudine Sana", description: "25 sessioni completate", category: "consistency", iconName: "calendar-check", requirementType: "sessions_count", requirementValue: 25, xpReward: 200, rarity: "common", sortOrder: 21 },
    { code: "sessions_50", name: "Mezzo Centinaio", description: "50 sessioni di puro impegno", category: "consistency", iconName: "target", requirementType: "sessions_count", requirementValue: 50, xpReward: 400, rarity: "uncommon", sortOrder: 22 },
    { code: "sessions_100", name: "Centenario", description: "100 sessioni! La costanza paga", category: "consistency", iconName: "award", requirementType: "sessions_count", requirementValue: 100, xpReward: 750, rarity: "rare", sortOrder: 23 },
    { code: "sessions_200", name: "Devoto alla Vasca", description: "200 sessioni di dedizione totale", category: "consistency", iconName: "heart", requirementType: "sessions_count", requirementValue: 200, xpReward: 1500, rarity: "epic", sortOrder: 24 },
    { code: "sessions_365", name: "Un Anno in Vasca", description: "365 sessioni - praticamente ogni giorno!", category: "consistency", iconName: "sun", requirementType: "sessions_count", requirementValue: 365, xpReward: 3000, rarity: "legendary", sortOrder: 25 },
    
    // Open water badges
    { code: "ow_first", name: "Battesimo del Mare", description: "Prima nuotata in acque libere", category: "open_water", iconName: "waves", requirementType: "open_water_sessions", requirementValue: 1, xpReward: 200, rarity: "uncommon", sortOrder: 40 },
    { code: "ow_5", name: "Navigatore", description: "5 sessioni in acque libere", category: "open_water", iconName: "compass", requirementType: "open_water_sessions", requirementValue: 5, xpReward: 300, rarity: "uncommon", sortOrder: 41 },
    { code: "ow_10", name: "Lupo di Mare", description: "10 sessioni in acque libere", category: "open_water", iconName: "ship", requirementType: "open_water_sessions", requirementValue: 10, xpReward: 750, rarity: "rare", sortOrder: 42 },
    { code: "ow_5km", name: "Esploratore Marino", description: "5 km totali in mare aperto", category: "open_water", iconName: "anchor", requirementType: "open_water_total", requirementValue: 5000, xpReward: 500, rarity: "rare", sortOrder: 43 },
    { code: "ow_25km", name: "Attraversatore", description: "25 km totali in mare", category: "open_water", iconName: "globe", requirementType: "open_water_total", requirementValue: 25000, xpReward: 1500, rarity: "epic", sortOrder: 44 },
    
    // Special Oppidum badges
    { code: "oppidum_member", name: "Membro Oppidum", description: "Benvenuto nella famiglia Oppidum!", category: "special", iconName: "users", requirementType: "special", requirementValue: 0, xpReward: 100, rarity: "common", sortOrder: 50, colorPrimary: "#1e3a5f", colorSecondary: "#3b82f6" },
    { code: "polpo_oro", name: "Polpo d'Oro", description: "Badge esclusivo per i fondatori di SwimForge", category: "special", iconName: "octagon", requirementType: "special", requirementValue: 0, xpReward: 1000, rarity: "legendary", sortOrder: 53, colorPrimary: "#eab308", colorSecondary: "#fde047" },
    
    // Milestone badges
    { code: "time_10h", name: "Prime 10 Ore", description: "10 ore totali in acqua", category: "milestone", iconName: "clock", requirementType: "total_time", requirementValue: 36000, xpReward: 200, rarity: "common", sortOrder: 60 },
    { code: "time_50h", name: "50 Ore di Dedizione", description: "Mezzo centinaio di ore nuotate", category: "milestone", iconName: "hourglass", requirementType: "total_time", requirementValue: 180000, xpReward: 500, rarity: "uncommon", sortOrder: 61 },
    { code: "time_100h", name: "Centenario del Tempo", description: "100 ore in vasca!", category: "milestone", iconName: "timer", requirementType: "total_time", requirementValue: 360000, xpReward: 1000, rarity: "rare", sortOrder: 62 },
    { code: "level_5", name: "Livello 5 Raggiunto", description: "Sei diventato un Atleta!", category: "milestone", iconName: "arrow-up", requirementType: "level_reached", requirementValue: 5, xpReward: 250, rarity: "common", sortOrder: 63 },
    { code: "level_10", name: "Livello 10 Raggiunto", description: "Sei un Gran Maestro!", category: "milestone", iconName: "arrow-up-circle", requirementType: "level_reached", requirementValue: 10, xpReward: 500, rarity: "rare", sortOrder: 64 },
    { code: "level_15", name: "Livello 15 Raggiunto", description: "Sei un Mito!", category: "milestone", iconName: "chevrons-up", requirementType: "level_reached", requirementValue: 15, xpReward: 1000, rarity: "epic", sortOrder: 65 },
    { code: "level_20", name: "Poseidone", description: "Hai raggiunto il livello massimo!", category: "milestone", iconName: "crown", requirementType: "level_reached", requirementValue: 20, xpReward: 2500, rarity: "legendary", sortOrder: 66 },
  ];
  
  for (const badge of badges) {
    await db.createBadgeDefinition({
      code: badge.code,
      name: badge.name,
      description: badge.description,
      category: badge.category as any,
      iconName: badge.iconName,
      requirementType: badge.requirementType,
      requirementValue: badge.requirementValue,
      xpReward: badge.xpReward,
      rarity: badge.rarity as any,
      sortOrder: badge.sortOrder,
      colorPrimary: (badge as any).colorPrimary || "#1e3a5f",
      colorSecondary: (badge as any).colorSecondary || "#3b82f6",
    });
  }
}

export type AppRouter = typeof appRouter;
