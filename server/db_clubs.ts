import { DB_UNAVAILABLE_ERR_MSG } from "@shared/const";
import { and, eq, ilike, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "./db";
import { ensureUserPresenceSchema, getOnlineIntervalSql } from "./user_presence";
import { deleteClubRows } from "./account_clubs";
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
      c.logo_url,
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
      sp.username AS user_username,
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
      sp.username AS user_username,
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
  await ensureUserPresenceSchema();

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
      sp.username AS user_username,
      sp.avatar_url AS user_avatar,
      EXISTS(
        SELECT 1 FROM user_presence up
        WHERE up.user_id = p.user_id
          AND up.last_seen_at >= ${getOnlineIntervalSql()}
      ) AS user_is_online,
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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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

/**
 * clubs.get hides a club from non-members only when is_private is set, so every club
 * that is not public ("private" and "invite") is stored as private, as updateClub does.
 */
export function clubPrivacy(input: { isPrivate?: boolean; visibility?: "public" | "private" | "invite" }) {
  const visibility = input.visibility ?? (input.isPrivate ? "private" : "public");
  return { visibility, isPrivate: visibility !== "public" };
}

export async function createClub(userId: number, input: { name: string; description?: string | null; coverImageUrl?: string | null; websiteUrl?: string | null; isPrivate?: boolean; visibility?: "public" | "private" | "invite"; rules?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
      ...clubPrivacy(input),
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

type MembershipExecutor = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

/**
 * FOR SHARE on the club row, taken by every write that makes someone an active member, in the same
 * transaction: it waits for an account deletion holding the club (FOR UPDATE) and then finds no
 * club, or the deletion waits for it and then counts the new member. Null when the club is gone.
 */
async function lockClubForMembership(tx: MembershipExecutor, clubId: number) {
  const result = await tx.execute(sql`SELECT id, visibility, rules FROM community_clubs WHERE id = ${clubId} FOR SHARE`);
  return (result.rows[0] as { id: number; visibility: string | null; rules: string | null } | undefined) ?? null;
}

export async function joinClub(userId: number, clubId: number, options: { acceptRules?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  return db.transaction(async (tx) => {
    const club = await lockClubForMembership(tx, clubId);
    if (!club) throw new Error("Club not found");
    const hasRules = Boolean(club.rules && club.rules.trim().length > 0);
    if (hasRules && !options.acceptRules) {
      throw new Error("Rules not accepted");
    }

    const existingResult = await tx.execute(sql`
      SELECT id, status, role FROM community_club_members
      WHERE club_id = ${clubId} AND user_id = ${userId}
      LIMIT 1`);
    const existing = existingResult.rows[0] as { id: number; status: string; role: string } | undefined;

    if (existing) {
      if (existing.status === "banned") {
        throw new Error("Banned");
      }
      const hasStaffRole = ["owner", "admin", "moderator"].includes(existing.role);
      const nextStatus = hasStaffRole || club.visibility === "public" ? "active" : "pending";

      await tx.execute(sql`UPDATE community_club_members SET status = ${nextStatus}, joined_at = NOW() WHERE id = ${existing.id}`);
      return nextStatus === "active" ? { joined: true } : { requested: true };
    }

    const status = club.visibility === "public" ? "active" : "pending";
    await tx.execute(sql`
      INSERT INTO community_club_members (club_id, user_id, role, status, joined_at)
      VALUES (${clubId}, ${userId}, 'member', ${status}, NOW())`);
    return status === "active" ? { joined: true } : { requested: true };
  });
}

export async function leaveClub(userId: number, clubId: number) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db.transaction(async (tx) => {
    if (!(await lockClubForMembership(tx, clubId))) throw new Error("Club not found");
    await tx.execute(sql`
      UPDATE community_club_members SET status = 'active', joined_at = NOW()
      WHERE club_id = ${clubId} AND user_id = ${userId} AND status = 'pending'`);
  });

  return { approved: true };
}

export async function rejectJoinRequest(actorId: number, clubId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const actor = await getClubMemberRole(actorId, clubId);
  if (!actor || actor.status !== "active" || !["owner", "admin", "moderator"].includes(actor.role)) {
    throw new Error("Forbidden");
  }

  await db.transaction(async (tx) => {
    if (!(await lockClubForMembership(tx, clubId))) throw new Error("Club not found");
    await tx.execute(sql`UPDATE community_club_members SET status = 'active' WHERE club_id = ${clubId} AND user_id = ${userId}`);
  });

  return { unbanned: true };
}

export async function updateMemberRole(actorId: number, clubId: number, userId: number, role: "member" | "moderator" | "admin") {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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

/**
 * Hands the club to another active member: only its owner can, for instance before deleting their
 * account. The new owner gets the owner role, the old owner stays as admin.
 */
export async function transferClubOwnership(actorId: number, clubId: number, newOwnerId: number) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  return db.transaction(async (tx) => {
    const club = await tx.execute(sql`SELECT owner_id FROM community_clubs WHERE id = ${clubId} FOR UPDATE`);
    const owner = club.rows[0] as { owner_id: unknown } | undefined;
    if (!owner) throw new Error("Club not found");
    if (Number(owner.owner_id) !== actorId) throw new Error("Forbidden");
    if (newOwnerId === actorId) throw new Error("Target not an active member");

    const target = await tx.execute(sql`
      SELECT status, role FROM community_club_members
      WHERE club_id = ${clubId} AND user_id = ${newOwnerId}
      LIMIT 1`);
    const membership = target.rows[0] as { status?: string } | undefined;
    if (membership?.status !== "active") throw new Error("Target not an active member");

    await tx.execute(sql`UPDATE community_clubs SET owner_id = ${newOwnerId}, updated_at = now() WHERE id = ${clubId}`);
    await tx.execute(sql`UPDATE community_club_members SET role = 'owner' WHERE club_id = ${clubId} AND user_id = ${newOwnerId}`);
    await tx.execute(sql`UPDATE community_club_members SET role = 'admin' WHERE club_id = ${clubId} AND user_id = ${actorId}`);
    return { transferred: true, clubId, ownerId: newOwnerId } as const;
  });
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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  return db.transaction(async (tx) => {
    const inviteResult = await tx.execute(sql`
      SELECT id, club_id, role, status, max_uses, used_count, expires_at
      FROM community_club_invites
      WHERE code = ${code}
      LIMIT 1
      FOR UPDATE
    `);

    const invite = inviteResult.rows[0] as
      | {
          id: number;
          club_id: number;
          role: "member" | "moderator" | null;
          status: string;
          max_uses: number;
          used_count: number;
          expires_at: Date | null;
        }
      | undefined;

    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "active") throw new Error("Invite inactive");
    if (invite.expires_at && invite.expires_at.getTime() < Date.now()) throw new Error("Invite expired");
    if (invite.used_count >= invite.max_uses) throw new Error("Invite exhausted");
    if (!(await lockClubForMembership(tx, invite.club_id))) throw new Error("Club not found");

    const existing = await tx
      .select({
        id: communityClubMembers.id,
        status: communityClubMembers.status,
        role: communityClubMembers.role,
      })
      .from(communityClubMembers)
      .where(and(eq(communityClubMembers.clubId, invite.club_id), eq(communityClubMembers.userId, userId)))
      .limit(1);

    if (existing.length && existing[0].status === "banned") {
      throw new Error("Banned");
    }

    if (!existing.length) {
      await tx.insert(communityClubMembers).values({
        clubId: invite.club_id,
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
      await tx
        .update(communityClubMembers)
        .set({ status: "active", role: nextRole, joinedAt: new Date() })
        .where(eq(communityClubMembers.id, existing[0].id));
    }

    const consumeInvite = await tx.execute(sql`
      UPDATE community_club_invites
      SET used_count = used_count + 1
      WHERE id = ${invite.id}
        AND used_count < max_uses
      RETURNING club_id
    `);

    if (!consumeInvite.rows.length) {
      throw new Error("Invite exhausted");
    }

    return { joined: true, clubId: invite.club_id };
  });
}

export async function updateClub(userId: number, clubId: number, input: { name?: string; description?: string | null; coverImageUrl?: string | null; websiteUrl?: string | null; visibility?: "public" | "private" | "invite"; rules?: string | null; themeColor?: string; logoUrl?: string | null; tagline?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  return db.transaction(async (tx) => {
    const club = await tx.execute(sql`SELECT owner_id FROM community_clubs WHERE id = ${clubId} FOR UPDATE`);
    const owner = club.rows[0] as { owner_id: unknown } | undefined;
    if (!owner) throw new Error("Club not found");
    if (Number(owner.owner_id) !== userId) throw new Error("Forbidden");

    // Every row of the club, explicitly: its posts must not outlive it into the public feed
    // (social_posts.club_id only sets null).
    await deleteClubRows(tx, [clubId]);
    return { success: true };
  });
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
