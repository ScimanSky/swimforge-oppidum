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
      c.website_url,
      c.is_private,
      c.visibility,
      c.owner_id,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active' LIMIT 1) AS member_role,
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
      c.website_url,
      c.is_private,
      c.visibility,
      c.owner_id,
      c.theme_color,
      c.logo_url,
      c.tagline,
      c.created_at,
      COALESCE((SELECT COUNT(*) FROM community_club_members m WHERE m.club_id = c.id AND m.status = 'active'), 0) AS member_count,
      EXISTS(
        SELECT 1 FROM community_club_members m
        WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active'
      ) AS is_member,
      (SELECT m.role FROM community_club_members m WHERE m.club_id = c.id AND m.user_id = ${userId} AND m.status = 'active' LIMIT 1) AS member_role,
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
      p.media_urls,
      p.tagged_user_ids,
      p.hashtags,
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
      a.is_open_water AS activity_is_open_water,
      a.calories AS activity_calories,
      a.avg_heart_rate AS activity_heart_rate,
      a.swolf_score AS activity_swolf,
      COALESCE((SELECT COUNT(*) FROM social_splashes s WHERE s.post_id = p.id), 0) AS splash_count,
      COALESCE((SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id), 0) AS comment_count,
      EXISTS(
        SELECT 1 FROM social_splashes s
        WHERE s.post_id = p.id AND s.user_id = ${userId}
      ) AS has_splashed,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'user_id', tu.id,
              'name', tu.name,
              'username', tsp.username,
              'avatar_url', tsp.avatar_url
            )
          )
          FROM users tu
          LEFT JOIN swimmer_profiles tsp ON tsp.user_id = tu.id
          WHERE tu.id = ANY(COALESCE(p.tagged_user_ids, '{}'::integer[]))
        ),
        '[]'::json
      ) AS tagged_users
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

export async function createClubPost(
  userId: number,
  clubId: number,
  input: {
    content?: string | null;
    mediaUrl?: string | null;
    mediaUrls?: string[] | null;
    taggedUserIds?: number[] | null;
    hashtags?: string[] | null;
  }
) {
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
      mediaUrls: input.mediaUrls ?? [],
      taggedUserIds: input.taggedUserIds ?? [],
      hashtags: input.hashtags ?? [],
      visibility: "public",
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: socialPosts.id });

  return inserted[0]?.id ?? null;
}

export async function createClub(userId: number, input: { name: string; description?: string | null; coverImageUrl?: string | null; websiteUrl?: string | null; isPrivate?: boolean; visibility?: "public" | "private" | "invite"; rules?: string | null }) {
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
      websiteUrl: input.websiteUrl ?? null,
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

export async function joinClub(userId: number, clubId: number, options: { acceptRules?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const club = await db
    .select({
      id: communityClubs.id,
      isPrivate: communityClubs.isPrivate,
      visibility: communityClubs.visibility,
      rules: communityClubs.rules,
    })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club.length) throw new Error("Club not found");
  const hasRules = Boolean(club[0].rules && club[0].rules.trim().length > 0);
  if (hasRules && !options.acceptRules) {
    throw new Error("Rules not accepted");
  }

  const existing = await db
    .select({
      id: communityClubMembers.id,
      status: communityClubMembers.status,
      role: communityClubMembers.role,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (existing.length) {
    if (existing[0].status === "banned") {
      throw new Error("Banned");
    }
    const hasStaffRole = ["owner", "admin", "moderator"].includes(existing[0].role);
    const nextStatus = hasStaffRole || club[0].visibility === "public" ? "active" : "pending";

    await db
      .update(communityClubMembers)
      .set({ status: nextStatus, joinedAt: new Date() })
      .where(eq(communityClubMembers.id, existing[0].id));
    return nextStatus === "active" ? { joined: true } : { requested: true };
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

  const existing = await db
    .select({
      id: communityClubMembers.id,
      status: communityClubMembers.status,
      role: communityClubMembers.role,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (!existing.length) {
    throw new Error("Not a club member");
  }
  if (existing[0].status === "banned") {
    throw new Error("Banned");
  }

  await db
    .update(communityClubMembers)
    .set({ status: "left" })
    .where(eq(communityClubMembers.id, existing[0].id));

  const wasStaff = ["owner", "admin", "moderator"].includes(existing[0].role);
  if (wasStaff) {
    const stillHasActiveStaff = await db
      .select({ id: communityClubMembers.id })
      .from(communityClubMembers)
      .where(and(
        eq(communityClubMembers.clubId, clubId),
        eq(communityClubMembers.status, "active"),
        sql`${communityClubMembers.role} IN ('owner', 'admin', 'moderator')`
      ))
      .limit(1);

    if (!stillHasActiveStaff.length) {
      const oldestActiveMember = await db
        .select({
          id: communityClubMembers.id,
          role: communityClubMembers.role,
        })
        .from(communityClubMembers)
        .where(and(
          eq(communityClubMembers.clubId, clubId),
          eq(communityClubMembers.status, "active"),
        ))
        .orderBy(communityClubMembers.joinedAt, communityClubMembers.id)
        .limit(1);

      if (oldestActiveMember.length && oldestActiveMember[0].role === "member") {
        await db
          .update(communityClubMembers)
          .set({ role: "moderator" })
          .where(eq(communityClubMembers.id, oldestActiveMember[0].id));
      }
    }
  }

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
    .select({
      id: communityClubMembers.id,
      status: communityClubMembers.status,
      role: communityClubMembers.role,
    })
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
    const nextRole =
      existing[0].role && existing[0].role !== "member"
        ? existing[0].role
        : (invite.role ?? existing[0].role ?? "member");
    await db
      .update(communityClubMembers)
      .set({ status: "active", role: nextRole, joinedAt: new Date() })
      .where(eq(communityClubMembers.id, existing[0].id));
  }

  await db
    .update(communityClubInvites)
    .set({ usedCount: invite.usedCount + 1 })
    .where(eq(communityClubInvites.id, invite.id));

  return { joined: true, clubId: invite.clubId };
}

export async function updateClub(userId: number, clubId: number, input: { name?: string; description?: string | null; coverImageUrl?: string | null; websiteUrl?: string | null; visibility?: "public" | "private" | "invite"; rules?: string | null; themeColor?: string; logoUrl?: string | null; tagline?: string | null }) {
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
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.visibility !== undefined ? { isPrivate: input.visibility !== "public" } : {}),
      ...(input.themeColor !== undefined ? { themeColor: input.themeColor } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
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

export async function getClubWeeklyStats(clubId: number) {
  const db = await getDb();
  if (!db) return null;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const result = await db.execute(sql`
    SELECT
      COALESCE((
        SELECT COUNT(*)::int
        FROM social_posts p
        WHERE p.club_id = ${clubId}
          AND p.created_at >= ${oneWeekAgo.toISOString()}
      ), 0) AS posts_this_week,
      COALESCE((
        SELECT COUNT(DISTINCT p.user_id)::int
        FROM social_posts p
        WHERE p.club_id = ${clubId}
          AND p.created_at >= ${oneWeekAgo.toISOString()}
      ), 0) AS active_members,
      COALESCE((
        SELECT COUNT(*)::int
        FROM community_club_members m
        WHERE m.club_id = ${clubId} AND m.status = 'active'
      ), 0) AS total_members,
      (
        SELECT JSON_BUILD_OBJECT(
          'id', e.id,
          'title', e.title,
          'startTime', e.start_time,
          'eventType', e.event_type
        )
        FROM club_events e
        WHERE e.club_id = ${clubId}
          AND e.status = 'active'
          AND e.start_time > NOW()
        ORDER BY e.start_time ASC
        LIMIT 1
      ) AS next_event
  `);

  return result.rows[0] ?? null;
}
