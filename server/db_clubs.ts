import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "./db";
import { communityClubs, communityClubMembers, socialPosts, swimmingActivities } from "../drizzle/schema";

export type ClubScope = "all" | "mine";

export async function listClubs(userId: number, options: { search?: string; scope?: ClubScope; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];

  const scope = options.scope ?? "all";
  const limit = options.limit ?? 50;
  const filters: any[] = [];

  if (options.search) {
    filters.push(sql`c.name ILIKE ${`%${options.search}%`}`);
  }

  if (scope === "mine") {
    filters.push(sql`EXISTS (
      SELECT 1 FROM community_club_members m
      WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
    )`);
  }

  const whereClause = filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;

  const result = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.description,
      c.cover_image_url,
      c.is_private,
      c.owner_id,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_role
    FROM community_clubs c
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function getClubById(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.description,
      c.cover_image_url,
      c.is_private,
      c.owner_id,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_role
    FROM community_clubs c
    WHERE c.id = ${clubId}
    LIMIT 1
  `);

  return result.rows[0] ?? null;
}

export async function listClubMembers(clubId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      m.user_id,
      m.role,
      m.joined_at,
      u.name AS user_name,
      u.email AS user_email,
      sp.avatar_url AS user_avatar
    FROM community_club_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE m.club_id = ${clubId} AND m.status = 'active'
    ORDER BY m.joined_at ASC
  `);

  return result.rows;
}

export async function getClubFeed(userId: number, clubId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      p.id,
      p.user_id,
      p.activity_id,
      p.club_id,
      p.content,
      p.media_url,
      p.visibility,
      p.created_at,
      u.name AS user_name,
      u.email AS user_email,
      sp.avatar_url AS user_avatar,
      a.distance_meters AS activity_distance_meters,
      a.duration_seconds AS activity_duration_seconds,
      a.activity_date AS activity_date,
      a.activity_source AS activity_source,
      a.stroke_type AS activity_stroke_type,
      COALESCE((SELECT COUNT(*) FROM social_splashes s WHERE s.post_id = p.id), 0) AS splash_count,
      COALESCE((SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id), 0) AS comment_count,
      EXISTS(
        SELECT 1 FROM social_splashes s
        WHERE s.post_id = p.id AND s.user_id = ${userId}
      ) AS has_splashed
    FROM social_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    LEFT JOIN swimming_activities a ON a.id = p.activity_id
    WHERE p.is_deleted = false AND p.club_id = ${clubId}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function createClubPost(userId: number, clubId: number, input: { content?: string | null; mediaUrl?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const isMember = await db
    .select({ id: communityClubMembers.id })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (!isMember.length) {
    throw new Error("Not a club member");
  }

  const inserted = await db
    .insert(socialPosts)
    .values({
      userId,
      clubId,
      content: input.content ?? null,
      mediaUrl: input.mediaUrl ?? null,
      visibility: "public",
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: socialPosts.id });

  return inserted[0]?.id ?? null;
}

export async function createClub(userId: number, input: { name: string; description?: string | null; coverImageUrl?: string | null; isPrivate?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db
    .select({ id: communityClubs.id })
    .from(communityClubs)
    .where(eq(communityClubs.name, input.name))
    .limit(1);

  if (existing.length) {
    throw new Error("Club name already exists");
  }

  const inserted = await db
    .insert(communityClubs)
    .values({
      name: input.name,
      description: input.description ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      ownerId: userId,
      isPrivate: input.isPrivate ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: communityClubs.id });

  const clubId = inserted[0]?.id;
  if (!clubId) throw new Error("Failed to create club");

  await db.insert(communityClubMembers).values({
    clubId,
    userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  return clubId;
}

export async function joinClub(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const club = await db
    .select({ id: communityClubs.id, isPrivate: communityClubs.isPrivate })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club.length) throw new Error("Club not found");
  if (club[0].isPrivate) throw new Error("Club is private");

  const existing = await db
    .select({ id: communityClubMembers.id })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (existing.length) {
    await db
      .update(communityClubMembers)
      .set({ status: "active" })
      .where(eq(communityClubMembers.id, existing[0].id));
    return { joined: true };
  }

  await db.insert(communityClubMembers).values({
    clubId,
    userId,
    role: "member",
    status: "active",
    joinedAt: new Date(),
  });

  return { joined: true };
}

export async function leaveClub(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)));

  return { left: true };
}
