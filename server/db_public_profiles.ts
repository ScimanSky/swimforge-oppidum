import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { users, swimmerProfiles, socialFollows } from "../drizzle/schema";

type PublicProfile = {
  userId: number;
  name: string | null;
  email?: string | null;
  username: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  location: string | null;
  level: number | null;
  totalXp: number | null;
  privacySettings: unknown;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
};

const getPrivacyFlag = (privacySettings: unknown, key: string, fallback: boolean) => {
  if (!privacySettings || typeof privacySettings !== "object") return fallback;
  const record = privacySettings as Record<string, unknown>;
  const raw = record[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};

export async function getUserPublicProfile(params: {
  viewerUserId: number;
  targetUserId: number;
}): Promise<(PublicProfile & { profilePublic: boolean }) | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      username: swimmerProfiles.username,
      avatarUrl: swimmerProfiles.avatarUrl,
      coverUrl: swimmerProfiles.coverUrl,
      bio: swimmerProfiles.bio,
      location: swimmerProfiles.location,
      level: swimmerProfiles.level,
      totalXp: swimmerProfiles.totalXp,
      privacySettings: swimmerProfiles.privacySettings,
    })
    .from(users)
    .leftJoin(swimmerProfiles, eq(swimmerProfiles.userId, users.id))
    .where(eq(users.id, params.targetUserId))
    .limit(1);

  if (!row) return null;

  const followerCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialFollows)
    .where(and(eq(socialFollows.followingId, params.targetUserId), eq(socialFollows.status, "accepted")))
    .limit(1);
  const followingCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialFollows)
    .where(and(eq(socialFollows.followerId, params.targetUserId), eq(socialFollows.status, "accepted")))
    .limit(1);

  const isFollowingResult = await db
    .select({ id: socialFollows.id })
    .from(socialFollows)
    .where(
      and(
        eq(socialFollows.followerId, params.viewerUserId),
        eq(socialFollows.followingId, params.targetUserId),
        eq(socialFollows.status, "accepted")
      )
    )
    .limit(1);
  const isFollowedByResult = await db
    .select({ id: socialFollows.id })
    .from(socialFollows)
    .where(
      and(
        eq(socialFollows.followerId, params.targetUserId),
        eq(socialFollows.followingId, params.viewerUserId),
        eq(socialFollows.status, "accepted")
      )
    )
    .limit(1);

  const profilePublic = getPrivacyFlag(row.privacySettings, "profilePublic", true);

  return {
    ...row,
    followerCount: Number(followerCountResult[0]?.count ?? 0),
    followingCount: Number(followingCountResult[0]?.count ?? 0),
    isFollowing: isFollowingResult.length > 0,
    isFollowedBy: isFollowedByResult.length > 0,
    profilePublic,
  };
}

export async function getSuggestedUsers(viewerUserId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];

  // Users the viewer is NOT already following, excluding self, ordered by activity (level desc)
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      username: swimmerProfiles.username,
      avatarUrl: swimmerProfiles.avatarUrl,
      level: swimmerProfiles.level,
    })
    .from(users)
    .innerJoin(swimmerProfiles, eq(swimmerProfiles.userId, users.id))
    .where(
      and(
        sql`${users.id} != ${viewerUserId}`,
        sql`${users.id} NOT IN (
          SELECT ${socialFollows.followingId} FROM ${socialFollows}
          WHERE ${socialFollows.followerId} = ${viewerUserId}
        )`,
      )
    )
    .orderBy(sql`${swimmerProfiles.level} DESC`)
    .limit(limit);

  return rows;
}

export async function toggleFollow(params: { followerId: number; followingId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: socialFollows.id })
    .from(socialFollows)
    .where(
      and(
        eq(socialFollows.followerId, params.followerId),
        eq(socialFollows.followingId, params.followingId)
      )
    )
    .limit(1);

  if (existing.length) {
    await db.delete(socialFollows).where(eq(socialFollows.id, existing[0].id));
    return { following: false };
  }

  await db
    .insert(socialFollows)
    .values({
      followerId: params.followerId,
      followingId: params.followingId,
      status: "accepted",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return { following: true };
}

