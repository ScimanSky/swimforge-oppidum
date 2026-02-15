import { and, eq, ilike, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "./db";
import { communityClubInvites, communityClubs, communityClubMembers, socialPosts, swimmingActivities } from "../drizzle/schema";

export type ClubScope = "all" | "mine";

export async function listClubs(userId: number, options: { search?: string; scope?: ClubScope; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];

  const scope = options.scope ?? "all";
  const limit = options.limit ?? 50;
  const filters: SQL[] = [];

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
      c.rules,
      c.cover_image_url,
      c.is_private,
      c.visibility,
      c.owner_id,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_role,
      (SELECT m.status FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_status
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
      c.rules,
      c.cover_image_url,
      c.is_private,
      c.visibility,
      c.owner_id,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_role,
      (SELECT m.status FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} LIMIT 1) AS member_status
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
      m.status,
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

export async function listClubMembersByStatus(clubId: number, status: "pending" | "banned") {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      m.user_id,
      m.role,
      m.status,
      m.joined_at,
      u.name AS user_name,
      u.email AS user_email,
      sp.avatar_url AS user_avatar
    FROM community_club_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE m.club_id = ${clubId} AND m.status = ${status}
    ORDER BY m.joined_at ASC
  `);

  return result.rows;
}

export async function getClubMemberRole(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  return result[0] ?? null;
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
    WHERE p.is_deleted = false
      AND p.club_id = ${clubId}
      AND NOT EXISTS (
        SELECT 1
        FROM social_hidden_posts hp
        WHERE hp.post_id = p.id AND hp.user_id = ${userId}
      )
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
    .where(and(
      eq(communityClubMembers.clubId, clubId),
      eq(communityClubMembers.userId, userId),
      eq(communityClubMembers.status, "active")
    ))
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

export async function createClub(userId: number, input: { name: string; description?: string | null; coverImageUrl?: string | null; isPrivate?: boolean; visibility?: "public" | "private" | "invite"; rules?: string | null }) {
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
      rules: input.rules ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      ownerId: userId,
      isPrivate: input.isPrivate ?? false,
      visibility: input.visibility ?? (input.isPrivate ? "private" : "public"),
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
    .select({ id: communityClubs.id, isPrivate: communityClubs.isPrivate, visibility: communityClubs.visibility })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club.length) throw new Error("Club not found");

  const existing = await db
    .select({ id: communityClubMembers.id, status: communityClubMembers.status })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (existing.length) {
    if (existing[0].status === "banned") {
      throw new Error("Banned");
    }
    if (club[0].visibility !== "public") {
      await db
        .update(communityClubMembers)
        .set({ status: "pending" })
        .where(eq(communityClubMembers.id, existing[0].id));
      return { requested: true };
    }
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
    status: club[0].visibility === "public" ? "active" : "pending",
    joinedAt: new Date(),
  });

  return club[0].visibility === "public" ? { joined: true } : { requested: true };
}

export async function leaveClub(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)));

  return { left: true };
}

export async function approveJoinRequest(actorId: number, clubId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db
    .update(communityClubMembers)
    .set({ status: "active", joinedAt: new Date() })
    .where(and(
      eq(communityClubMembers.clubId, clubId),
      eq(communityClubMembers.userId, userId),
      eq(communityClubMembers.status, "pending")
    ));

  return { approved: true };
}

export async function rejectJoinRequest(actorId: number, clubId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db
    .delete(communityClubMembers)
    .where(and(
      eq(communityClubMembers.clubId, clubId),
      eq(communityClubMembers.userId, userId),
      eq(communityClubMembers.status, "pending")
    ));

  return { rejected: true };
}

export async function banMember(actorId: number, clubId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  const target = await getClubMemberRole(userId, clubId);
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("Cannot ban owner");

  await db
    .update(communityClubMembers)
    .set({ status: "banned" })
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)));

  return { banned: true };
}

export async function unbanMember(actorId: number, clubId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db
    .update(communityClubMembers)
    .set({ status: "active" })
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)));

  return { unbanned: true };
}

export async function updateMemberRole(actorId: number, clubId: number, userId: number, role: "member" | "moderator" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || actor.role !== "owner") {
    throw new Error("Forbidden");
  }

  const target = await getClubMemberRole(userId, clubId);
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("Cannot change owner");

  await db
    .update(communityClubMembers)
    .set({ role })
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)));

  return { updated: true };
}

export async function listClubInvites(actorId: number, clubId: number) {
  const db = await getDb();
  if (!db) return [];

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  const result = await db.execute(sql`
    SELECT
      i.id,
      i.code,
      i.role,
      i.status,
      i.max_uses,
      i.used_count,
      i.expires_at,
      i.created_at
    FROM community_club_invites i
    WHERE i.club_id = ${clubId}
    ORDER BY i.created_at DESC
  `);

  return result.rows;
}

export async function createClubInvite(actorId: number, clubId: number, input: { role?: "member" | "moderator"; maxUses?: number; expiresAt?: Date | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  if (input.role === "moderator" && actor.role !== "owner" && actor.role !== "admin") {
    throw new Error("Forbidden");
  }

  const { nanoid } = await import("nanoid");
  const code = nanoid(10);

  const inserted = await db
    .insert(communityClubInvites)
    .values({
      clubId,
      inviterId: actorId,
      code,
      role: input.role ?? "member",
      status: "active",
      maxUses: input.maxUses ?? 1,
      usedCount: 0,
      expiresAt: input.expiresAt ?? null,
      createdAt: new Date(),
    })
    .returning({ id: communityClubInvites.id, code: communityClubInvites.code });

  return inserted[0] ?? null;
}

export async function revokeClubInvite(actorId: number, clubId: number, inviteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db
    .update(communityClubInvites)
    .set({ status: "revoked" })
    .where(and(eq(communityClubInvites.id, inviteId), eq(communityClubInvites.clubId, clubId)));

  return { revoked: true };
}

export async function acceptClubInvite(userId: number, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const inviteResult = await db
    .select()
    .from(communityClubInvites)
    .where(eq(communityClubInvites.code, code))
    .limit(1);

  const invite = inviteResult[0];
  if (!invite) throw new Error("Invite not found");

  if (invite.status !== "active") {
    throw new Error("Invite inactive");
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new Error("Invite expired");
  }
  if (invite.usedCount >= invite.maxUses) {
    throw new Error("Invite exhausted");
  }

  const existing = await db
    .select({ id: communityClubMembers.id, status: communityClubMembers.status })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, invite.clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (existing.length && existing[0].status === "banned") {
    throw new Error("Banned");
  }

  if (!existing.length) {
    await db.insert(communityClubMembers).values({
      clubId: invite.clubId,
      userId,
      role: invite.role ?? "member",
      status: "active",
      joinedAt: new Date(),
    });
  } else {
    await db
      .update(communityClubMembers)
      .set({ status: "active", role: invite.role ?? "member", joinedAt: new Date() })
      .where(eq(communityClubMembers.id, existing[0].id));
  }

  await db
    .update(communityClubInvites)
    .set({ usedCount: invite.usedCount + 1 })
    .where(eq(communityClubInvites.id, invite.id));

  return { joined: true, clubId: invite.clubId };
}

export async function updateClub(userId: number, clubId: number, input: { name?: string; description?: string | null; coverImageUrl?: string | null; visibility?: "public" | "private" | "invite"; rules?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const club = await db
    .select({ id: communityClubs.id, ownerId: communityClubs.ownerId })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club.length) throw new Error("Club not found");
  if (club[0].ownerId !== userId) throw new Error("Forbidden");

  await db
    .update(communityClubs)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.rules !== undefined ? { rules: input.rules } : {}),
      ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.visibility !== undefined ? { isPrivate: input.visibility !== "public" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(communityClubs.id, clubId));

  return { success: true };
}

export async function deleteClub(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const club = await db
    .select({ id: communityClubs.id, ownerId: communityClubs.ownerId })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club.length) throw new Error("Club not found");
  if (club[0].ownerId !== userId) throw new Error("Forbidden");

  await db.delete(communityClubs).where(eq(communityClubs.id, clubId));
  return { success: true };
}
