// Social-action XP (splash, comment, reaction, rsvp, club post).
// Standalone module: it has no dependency on gameplay engines and never creates tables.
import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { levelThresholds, swimmerProfiles, xpTransactions } from "../drizzle/schema";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ActionXpType = "comment" | "splash" | "reaction" | "rsvp" | "club_post";

type ActionXpRule = {
  xp: number;
};

export const ACTION_XP_RULES: Record<ActionXpType, ActionXpRule> = {
  comment: { xp: 16 },
  splash: { xp: 10 },
  reaction: { xp: 8 },
  rsvp: { xp: 12 },
  club_post: { xp: 20 },
};

export const ACTION_XP_DAILY_CAP = 90;

function toUtcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function applyXpWithUniqueDescription(params: {
  db: DbClient;
  userId: number;
  amount: number;
  description: string;
  referenceId?: number;
}): Promise<{ granted: boolean; newTotalXp: number; newLevel: number }> {
  const { db, userId, amount, description, referenceId } = params;
  if (amount <= 0) {
    const profile = await db
      .select({
        totalXp: swimmerProfiles.totalXp,
        level: swimmerProfiles.level,
      })
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);
    return {
      granted: false,
      newTotalXp: Number(profile[0]?.totalXp ?? 0),
      newLevel: Number(profile[0]?.level ?? 1),
    };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${description}))`);

    const existing = await tx
      .select({ count: sql<number>`count(*)` })
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, userId), eq(xpTransactions.description, description)));

    if (Number(existing[0]?.count ?? 0) > 0) {
      const profile = await tx
        .select({
          totalXp: swimmerProfiles.totalXp,
          level: swimmerProfiles.level,
        })
        .from(swimmerProfiles)
        .where(eq(swimmerProfiles.userId, userId))
        .limit(1);
      return {
        granted: false,
        newTotalXp: Number(profile[0]?.totalXp ?? 0),
        newLevel: Number(profile[0]?.level ?? 1),
      };
    }

    const profile = await tx
      .select({
        totalXp: swimmerProfiles.totalXp,
      })
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    const currentTotalXp = Number(profile[0]?.totalXp ?? 0);
    const newTotalXp = currentTotalXp + amount;

    const levelResult = await tx
      .select({
        level: sql<number>`coalesce(max(${levelThresholds.level}), 1)`,
      })
      .from(levelThresholds)
      .where(lte(levelThresholds.xpRequired, newTotalXp));
    const nextLevel = Number(levelResult[0]?.level ?? 1);

    await tx.insert(xpTransactions).values({
      userId,
      amount,
      reason: "bonus",
      referenceId: referenceId ?? null,
      description,
    });

    await tx
      .update(swimmerProfiles)
      .set({
        totalXp: newTotalXp,
        level: nextLevel,
        updatedAt: new Date(),
      })
      .where(eq(swimmerProfiles.userId, userId));

    return {
      granted: true,
      newTotalXp,
      newLevel: nextLevel,
    };
  });
}

async function getActionXpTotalForDay(db: DbClient, userId: number, dayKey: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)`,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, userId),
        sql`${xpTransactions.description} LIKE ${`action_xp:${dayKey}:%`}`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

async function getActionXpBreakdownForDay(db: DbClient, userId: number, dayKey: string) {
  const rows = await db
    .select({
      actionType: sql<string>`split_part(${xpTransactions.description}, ':', 3)`,
      total: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)`,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, userId),
        sql`${xpTransactions.description} LIKE ${`action_xp:${dayKey}:%`}`,
      ),
    )
    .groupBy(sql`split_part(${xpTransactions.description}, ':', 3)`);

  const byType: Record<ActionXpType, number> = {
    comment: 0,
    splash: 0,
    reaction: 0,
    rsvp: 0,
    club_post: 0,
  };

  for (const row of rows) {
    const actionType = String(row.actionType ?? "") as ActionXpType;
    if (actionType in byType) {
      byType[actionType] = Number(row.total ?? 0);
    }
  }

  return byType;
}

export async function getActionXpStatus(userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) {
    return {
      dayKey: toUtcDateKey(now),
      earnedToday: 0,
      cap: ACTION_XP_DAILY_CAP,
      remaining: ACTION_XP_DAILY_CAP,
      byType: {
        comment: 0,
        splash: 0,
        reaction: 0,
        rsvp: 0,
        club_post: 0,
      },
    };
  }

  const dayKey = toUtcDateKey(now);
  const [earnedToday, byType] = await Promise.all([
    getActionXpTotalForDay(db, userId, dayKey),
    getActionXpBreakdownForDay(db, userId, dayKey),
  ]);
  return {
    dayKey,
    earnedToday,
    cap: ACTION_XP_DAILY_CAP,
    remaining: Math.max(0, ACTION_XP_DAILY_CAP - earnedToday),
    byType,
  };
}

export async function awardActionXp(params: {
  userId: number;
  actionType: ActionXpType;
  entityId: number;
  targetOwnerUserId?: number | null;
  now?: Date;
}) {
  const db = await getDb();
  const now = params.now ?? new Date();
  const dayKey = toUtcDateKey(now);
  const rule = ACTION_XP_RULES[params.actionType];

  if (!db || !rule) {
    return {
      awardedXp: 0,
      reason: "unavailable" as const,
      dayKey,
      earnedToday: 0,
      cap: ACTION_XP_DAILY_CAP,
      remaining: ACTION_XP_DAILY_CAP,
    };
  }

  if (params.targetOwnerUserId && params.targetOwnerUserId === params.userId) {
    const status = await getActionXpStatus(params.userId, now);
    return {
      awardedXp: 0,
      reason: "self_action" as const,
      ...status,
    };
  }

  const uniqueDescription = `action_xp:${dayKey}:${params.actionType}:${params.entityId}`;
  const currentStatus = await getActionXpStatus(params.userId, now);
  const availableXp = Math.max(0, currentStatus.cap - currentStatus.earnedToday);
  const amountToGrant = Math.min(rule.xp, availableXp);

  if (amountToGrant <= 0) {
    return {
      awardedXp: 0,
      reason: "daily_cap_reached" as const,
      ...currentStatus,
    };
  }

  const result = await applyXpWithUniqueDescription({
    db,
    userId: params.userId,
    amount: amountToGrant,
    description: uniqueDescription,
    referenceId: params.entityId,
  });

  const refreshedStatus = await getActionXpStatus(params.userId, now);

  return {
    awardedXp: result.granted ? amountToGrant : 0,
    reason: (result.granted ? "awarded" : "already_awarded_today") as
      | "awarded"
      | "already_awarded_today",
    ...refreshedStatus,
  };
}
