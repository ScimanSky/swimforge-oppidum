import { and, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "./db";
import { communityClubs, communityClubMembers } from "../drizzle/schema";

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
