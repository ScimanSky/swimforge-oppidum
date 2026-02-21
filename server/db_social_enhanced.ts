/**
 * Database functions per le funzionalità social network avanzate
 * 
 * Gestisce:
 * - Eventi club (allenamenti, gare, eventi sociali)
 * - Messaggi diretti tra membri
 * - Notifiche utente
 * - Annunci club
 * - Galleria media club
 * - Reazioni avanzate ai post
 */

import { getDb } from "./db"
import { 
  clubEvents, 
  eventAttendees, 
  directMessages, 
  userNotifications,
  clubAnnouncements,
  clubMedia,
  postReactions,
  users,
  swimmerProfiles,
  communityClubs,
  communityClubMembers
} from "../drizzle/schema"
import { and, eq, desc, sql, gte, lte, or, isNull, inArray } from "drizzle-orm"

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>

async function requireDb(): Promise<DbClient> {
  const db = await getDb()
  if (!db) throw new Error("Database not available")
  return db
}

const ACTIVITY_SHARED_NOTIFICATION_TTL_HOURS = Math.max(
  1,
  Number.parseInt(process.env.ACTIVITY_SHARED_NOTIFICATION_TTL_HOURS ?? "24", 10) || 24
)

// ============================================
// CLUB EVENTS
// ============================================

/**
 * Crea un nuovo evento per un club
 */
export async function createClubEvent(params: {
  clubId: number
  creatorId: number
  title: string
  description?: string
  eventType: string
  location?: string
  locationLat?: number
  locationLng?: number
  routeGeojson?: unknown
  routeDistanceMeters?: number
  startTime: Date
  endTime?: Date
  maxAttendees?: number
  isRecurring?: boolean
  recurringRule?: string
  coverImageUrl?: string
  weatherSnapshot?: unknown
  weatherFetchedAt?: Date
}) {
  const db = await requireDb()
  const [event] = await db.insert(clubEvents).values(params).returning()
  return event
}

/**
 * Conta quanti eventi ha creato un utente da una certa data in poi.
 * Usato per limitare la creazione eventi degli utenti non staff.
 */
export async function countUserCreatedClubEventsSince(params: {
  userId: number
  since: Date
}) {
  const db = await requireDb()
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(clubEvents)
    .where(
      and(
        eq(clubEvents.creatorId, params.userId),
        gte(clubEvents.createdAt, params.since),
      )
    )

  return Number(row?.count ?? 0)
}

/**
 * Ottiene eventi di un club con filtri opzionali
 */
export async function getClubEvents(params: {
  clubId: number
  status?: string
  fromDate?: Date
  toDate?: Date
  limit?: number
  viewerUserId?: number
}) {
  const db = await requireDb()
  const conditions = [eq(clubEvents.clubId, params.clubId)]
  
  if (params.status) {
    conditions.push(eq(clubEvents.status, params.status))
  }
  
  if (params.fromDate) {
    conditions.push(gte(clubEvents.startTime, params.fromDate))
  }
  
  if (params.toDate) {
    conditions.push(lte(clubEvents.startTime, params.toDate))
  }
  
  const userRsvpExpr = params.viewerUserId
    ? sql<"going" | "maybe" | "not_going" | null>`
        (
          SELECT ${eventAttendees.status}
          FROM ${eventAttendees}
          WHERE ${eventAttendees.eventId} = ${clubEvents.id}
            AND ${eventAttendees.userId} = ${params.viewerUserId}
          LIMIT 1
        )
      `
    : sql<null>`NULL`

  const events = await db
    .select({
      event: clubEvents,
      creator: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
      attendeeCount: sql<number>`
        (
          SELECT COUNT(*)::int
          FROM ${eventAttendees}
          WHERE ${eventAttendees.eventId} = ${clubEvents.id}
            AND ${eventAttendees.status} = 'going'
        )
      `,
      maybeCount: sql<number>`
        (
          SELECT COUNT(*)::int
          FROM ${eventAttendees}
          WHERE ${eventAttendees.eventId} = ${clubEvents.id}
            AND ${eventAttendees.status} = 'maybe'
        )
      `,
      notGoingCount: sql<number>`
        (
          SELECT COUNT(*)::int
          FROM ${eventAttendees}
          WHERE ${eventAttendees.eventId} = ${clubEvents.id}
            AND ${eventAttendees.status} = 'not_going'
        )
      `,
      userRsvp: userRsvpExpr,
    })
    .from(clubEvents)
    .leftJoin(users, eq(clubEvents.creatorId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(and(...conditions))
    .orderBy(clubEvents.startTime)
    .limit(params.limit || 50)
  
  return events
}

/**
 * Ottiene un singolo evento con dettagli completi
 */
export async function getEventById(eventId: number) {
  const db = await requireDb()
  const [event] = await db
    .select({
      event: clubEvents,
      creator: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
      club: communityClubs,
    })
    .from(clubEvents)
    .leftJoin(users, eq(clubEvents.creatorId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .leftJoin(communityClubs, eq(clubEvents.clubId, communityClubs.id))
    .where(eq(clubEvents.id, eventId))
  
  return event
}

export async function getClubEventById(eventId: number) {
  const db = await requireDb()
  const [event] = await db
    .select()
    .from(clubEvents)
    .where(eq(clubEvents.id, eventId))
  return event
}

/**
 * RSVP ad un evento
 */
export async function rsvpToEvent(params: {
  eventId: number
  userId: number
  status: 'going' | 'maybe' | 'not_going'
}) {
  const db = await requireDb()
  
  // Verifica se esiste già un RSVP
  const [existing] = await db
    .select()
    .from(eventAttendees)
    .where(and(
      eq(eventAttendees.eventId, params.eventId),
      eq(eventAttendees.userId, params.userId)
    ))
  
  if (existing) {
    // Aggiorna
    const [updated] = await db
      .update(eventAttendees)
      .set({ status: params.status, rsvpAt: new Date() })
      .where(eq(eventAttendees.id, existing.id))
      .returning()
    return updated
  } else {
    // Inserisci nuovo
    const [attendee] = await db
      .insert(eventAttendees)
      .values(params)
      .returning()
    return attendee
  }
}

/**
 * Ottiene i partecipanti di un evento
 */
export async function getEventAttendees(eventId: number) {
  const db = await requireDb()
  const attendees = await db
    .select({
      id: eventAttendees.id,
      status: eventAttendees.status,
      rsvpAt: eventAttendees.rsvpAt,
      user: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
        fullName: sql<string | null>`
          NULLIF(TRIM(COALESCE(${users.name}, '') || ' ' || COALESCE(${swimmerProfiles.lastName}, '')), '')
        `,
      },
    })
    .from(eventAttendees)
    .innerJoin(users, eq(eventAttendees.userId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(eq(eventAttendees.eventId, eventId))
    .orderBy(desc(eventAttendees.rsvpAt))
  
  return attendees
}

/**
 * Aggiorna un evento
 */
export async function updateClubEvent(eventId: number, updates: Partial<typeof clubEvents.$inferInsert>) {
  const db = await requireDb()
  const [updated] = await db
    .update(clubEvents)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(clubEvents.id, eventId))
    .returning()
  return updated
}

/**
 * Cancella un evento
 */
export async function deleteClubEvent(eventId: number) {
  const db = await requireDb()
  await db.delete(eventAttendees).where(eq(eventAttendees.eventId, eventId))
  await db.delete(clubEvents).where(eq(clubEvents.id, eventId))
  return true
}

// ============================================
// DIRECT MESSAGES
// ============================================

/**
 * Invia un messaggio diretto
 */
export async function sendDirectMessage(params: {
  senderId: number
  receiverId: number
  content: string
  messageType?: "text" | "forward_post" | "forward_story"
  metadata?: Record<string, unknown> | null
}) {
  const db = await requireDb()
  try {
    const [message] = await db
      .insert(directMessages)
      .values({
        senderId: params.senderId,
        receiverId: params.receiverId,
        content: params.content,
        messageType: params.messageType ?? "text",
        metadata: params.metadata ?? null,
      })
      .returning()
    return message
  } catch {
    // Fallback for environments where DM advanced columns are not migrated yet.
    const result = await db.execute(sql`
      INSERT INTO direct_messages (sender_id, receiver_id, content)
      VALUES (${params.senderId}, ${params.receiverId}, ${params.content})
      RETURNING
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        content,
        is_read AS "isRead",
        read_at AS "readAt",
        created_at AS "createdAt"
    `)
    const row = result.rows[0] as
      | {
          id: number
          senderId: number
          receiverId: number
          content: string
          isRead: boolean
          readAt: Date | null
          createdAt: Date
        }
      | undefined
    if (!row) throw new Error("Failed to create direct message")
    return {
      id: Number(row.id),
      senderId: Number(row.senderId),
      receiverId: Number(row.receiverId),
      content: String(row.content ?? ""),
      messageType: "text" as "text" | "forward_post" | "forward_story",
      metadata: null,
      isRead: Boolean(row.isRead),
      readAt: row.readAt ? new Date(row.readAt) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    }
  }
}

/**
 * Ottiene conversazione tra due utenti
 */
export async function getConversation(params: {
  userId1: number
  userId2: number
  limit?: number
  offset?: number
}) {
  const db = await requireDb()
  const normalizedLimit = Math.max(1, Math.min(params.limit ?? 50, 100))
  const normalizedOffset = Math.max(0, params.offset ?? 0)

  // We intentionally avoid selecting advanced DM columns here to keep
  // conversation loading resilient even if production schema lags behind.
  const result = await db.execute(sql`
    SELECT
      dm.id,
      dm.sender_id AS "senderId",
      dm.receiver_id AS "receiverId",
      dm.content,
      dm.is_read AS "isRead",
      dm.read_at AS "readAt",
      dm.created_at AS "createdAt",
      u.id AS "userId",
      u.name AS "userName",
      u.email AS "userEmail",
      sp.avatar_url AS "profilePicture"
    FROM direct_messages dm
    JOIN users u ON u.id = dm.sender_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE
      (dm.sender_id = ${params.userId1} AND dm.receiver_id = ${params.userId2})
      OR
      (dm.sender_id = ${params.userId2} AND dm.receiver_id = ${params.userId1})
    ORDER BY dm.created_at DESC
    LIMIT ${normalizedLimit}
    OFFSET ${normalizedOffset}
  `)

  const messages = result.rows.map((row: any) => {
    const senderDisplayName =
      (typeof row.userName === "string" && row.userName.trim().length > 0 ? row.userName.trim() : null) ||
      (typeof row.userEmail === "string" && row.userEmail.includes("@") ? row.userEmail.split("@")[0] : null) ||
      `Utente #${row.userId}`

    return {
      message: {
        id: Number(row.id),
        senderId: Number(row.senderId),
        receiverId: Number(row.receiverId),
        content: String(row.content ?? ""),
        messageType: "text" as "text" | "forward_post" | "forward_story",
        metadata: null,
        isRead: Boolean(row.isRead),
        readAt: row.readAt ? new Date(row.readAt) : null,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
      },
      sender: {
        id: Number(row.userId),
        username: senderDisplayName,
        profilePicture: row.profilePicture ?? null,
      },
    }
  })

  return messages.reverse() // Ordine cronologico
}

/**
 * Segna messaggi come letti
 */
export async function markMessagesAsRead(params: {
  receiverId: number
  senderId: number
}) {
  const db = await requireDb()
  await db
    .update(directMessages)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(directMessages.receiverId, params.receiverId),
        eq(directMessages.senderId, params.senderId),
        eq(directMessages.isRead, false)
      )
    )
  return true
}

/**
 * Ottiene elenco conversazioni recenti di un utente
 */
export async function getRecentConversations(userId: number, limit: number = 20) {
  const db = await requireDb()
  const normalizedLimit = Math.max(1, Math.min(limit, 50))
  const scanLimit = Math.max(200, normalizedLimit * 80)

  // NOTE:
  // We intentionally avoid complex DISTINCT ON / CTE SQL here because some
  // production environments were failing this endpoint with 500.
  // We fetch recent messages ordered by createdAt and reduce in application code.
  const recentMessages = await db
    .select({
      id: directMessages.id,
      senderId: directMessages.senderId,
      receiverId: directMessages.receiverId,
      content: directMessages.content,
      isRead: directMessages.isRead,
      readAt: directMessages.readAt,
      createdAt: directMessages.createdAt,
    })
    .from(directMessages)
    .where(or(eq(directMessages.senderId, userId), eq(directMessages.receiverId, userId)))
    .orderBy(desc(directMessages.createdAt))
    .limit(scanLimit)

  const unreadRows = await db
    .select({
      otherUserId: directMessages.senderId,
      unreadCount: sql<number>`count(*)`,
    })
    .from(directMessages)
    .where(and(eq(directMessages.receiverId, userId), eq(directMessages.isRead, false)))
    .groupBy(directMessages.senderId)

  const unreadByUserId = new Map<number, number>(
    unreadRows.map((row) => [Number(row.otherUserId), Number(row.unreadCount ?? 0)]),
  )

  const latestByOtherUser = new Map<number, (typeof recentMessages)[number]>()
  for (const message of recentMessages) {
    const otherUserId = Number(message.senderId === userId ? message.receiverId : message.senderId)
    if (!otherUserId || latestByOtherUser.has(otherUserId)) continue
    latestByOtherUser.set(otherUserId, message)
    if (latestByOtherUser.size >= normalizedLimit) break
  }

  const otherUserIds = Array.from(latestByOtherUser.keys())
  const userRows =
    otherUserIds.length > 0
      ? await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            profilePicture: swimmerProfiles.avatarUrl,
          })
          .from(users)
          .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
          .where(inArray(users.id, otherUserIds))
      : []

  const usersById = new Map(
    userRows.map((row) => [
      Number(row.id),
      {
        name: row.name,
        email: row.email,
        profilePicture: row.profilePicture,
      },
    ]),
  )

  return otherUserIds
    .map((otherUserId) => {
      const row = latestByOtherUser.get(otherUserId)
      if (!row) return null
      const user = usersById.get(otherUserId)
      const displayName =
        user?.name?.trim() ||
        (typeof user?.email === "string" && user.email.includes("@") ? user.email.split("@")[0] : null) ||
        `Utente #${otherUserId}`

      return {
        lastMessage: {
          id: Number(row.id),
          senderId: Number(row.senderId),
          receiverId: Number(row.receiverId),
          content: String(row.content ?? ""),
          messageType: "text" as "text" | "forward_post" | "forward_story",
          metadata: null,
          isRead: Boolean(row.isRead),
          readAt: row.readAt ? new Date(row.readAt) : null,
          createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
        },
        otherUser: {
          id: Number(otherUserId),
          username: displayName,
          profilePicture: user?.profilePicture ?? null,
        },
        unreadCount: unreadByUserId.get(otherUserId) ?? 0,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime())
}

/**
 * Conta messaggi non letti totali per un utente
 */
export async function getUnreadDmCount(userId: number): Promise<number> {
  const db = await requireDb()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(directMessages)
    .where(
      and(
        eq(directMessages.receiverId, userId),
        eq(directMessages.isRead, false)
      )
    )
  return row?.count ?? 0
}

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Crea una notifica
 */
export async function createNotification(params: {
  userId: number
  type: string
  title: string
  message: string
  link?: string
  referenceId?: number
}) {
  const db = await requireDb()
  const [notification] = await db.insert(userNotifications).values(params).returning()
  return notification
}

/**
 * Ottiene notifiche di un utente
 */
export async function getUserNotifications(params: {
  userId: number
  limit?: number
  onlyUnread?: boolean
}) {
  const db = await requireDb()
  const conditions = [
    eq(userNotifications.userId, params.userId),
    sql`(
      ${userNotifications.type} <> 'activity_shared'
      OR ${userNotifications.createdAt} >= NOW() - (${ACTIVITY_SHARED_NOTIFICATION_TTL_HOURS} * INTERVAL '1 hour')
    )`,
  ]
  
  if (params.onlyUnread) {
    conditions.push(eq(userNotifications.isRead, false))
  }
  
  const notifications = await db
    .select()
    .from(userNotifications)
    .where(and(...conditions))
    .orderBy(desc(userNotifications.createdAt))
    .limit(params.limit || 50)
  
  return notifications
}

/**
 * Segna notifiche come lette
 */
export async function markNotificationsAsRead(userId: number, notificationIds?: number[]) {
  const db = await requireDb()

  const normalizedIds = Array.isArray(notificationIds)
    ? Array.from(new Set(notificationIds.filter((id): id is number => Number.isInteger(id) && id > 0)))
    : []

  const whereClause = normalizedIds.length > 0
    ? and(
        eq(userNotifications.userId, userId),
        inArray(userNotifications.id, normalizedIds),
      )
    : eq(userNotifications.userId, userId)

  await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(whereClause)
  
  return true
}

/**
 * Conta notifiche non lette
 */
export async function getUnreadNotificationCount(userId: number) {
  const db = await requireDb()
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.isRead, false),
        sql`(
          ${userNotifications.type} <> 'activity_shared'
          OR ${userNotifications.createdAt} >= NOW() - (${ACTIVITY_SHARED_NOTIFICATION_TTL_HOURS} * INTERVAL '1 hour')
        )`
      )
    )
  
  return result?.count || 0
}

/**
 * Cleanup retention per notifiche e messaggi diretti
 */
export async function cleanupSocialRetention(params: {
  notificationRetentionDays: number
  dmRetentionDays: number
  limit?: number
}) {
  const db = await requireDb()
  const limit = Math.max(1, Math.min(params.limit ?? 1000, 10_000))
  const notificationRetentionDays = Math.max(1, params.notificationRetentionDays)
  const dmRetentionDays = Math.max(1, params.dmRetentionDays)

  const deletedNotifications = await db.execute(sql`
    WITH doomed AS (
      SELECT id
      FROM user_notifications
      WHERE created_at < NOW() - (${notificationRetentionDays} * INTERVAL '1 day')
      ORDER BY created_at ASC
      LIMIT ${limit}
    )
    DELETE FROM user_notifications n
    USING doomed d
    WHERE n.id = d.id
    RETURNING n.id
  `)

  const deletedMessages = await db.execute(sql`
    WITH doomed AS (
      SELECT id
      FROM direct_messages
      WHERE created_at < NOW() - (${dmRetentionDays} * INTERVAL '1 day')
      ORDER BY created_at ASC
      LIMIT ${limit}
    )
    DELETE FROM direct_messages m
    USING doomed d
    WHERE m.id = d.id
    RETURNING m.id
  `)

  return {
    notificationsDeleted: deletedNotifications.rows.length,
    messagesDeleted: deletedMessages.rows.length,
    notificationRetentionDays,
    dmRetentionDays,
    limit,
  }
}

// ============================================
// CLUB ANNOUNCEMENTS
// ============================================

/**
 * Crea un annuncio per un club
 */
export async function createClubAnnouncement(params: {
  clubId: number
  authorId: number
  title: string
  content: string
  isPinned?: boolean
  expiresAt?: Date
}) {
  const db = await requireDb()
  const [announcement] = await db.insert(clubAnnouncements).values(params).returning()
  return announcement
}

/**
 * Ottiene annunci di un club
 */
export async function getClubAnnouncements(clubId: number, includeExpired: boolean = false) {
  const db = await requireDb()
  const conditions = [eq(clubAnnouncements.clubId, clubId)]
  
  if (!includeExpired) {
    const expirationCondition = or(
      isNull(clubAnnouncements.expiresAt),
      gte(clubAnnouncements.expiresAt, new Date())
    )
    if (expirationCondition) {
      conditions.push(expirationCondition)
    }
  }
  
  const announcements = await db
    .select({
      announcement: clubAnnouncements,
      author: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
    })
    .from(clubAnnouncements)
    .innerJoin(users, eq(clubAnnouncements.authorId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(and(...conditions))
    .orderBy(
      desc(clubAnnouncements.isPinned),
      desc(clubAnnouncements.createdAt)
    )
  
  return announcements
}

/**
 * Aggiorna un annuncio
 */
export async function updateClubAnnouncement(
  announcementId: number,
  updates: Partial<typeof clubAnnouncements.$inferInsert>
) {
  const db = await requireDb()
  const [updated] = await db
    .update(clubAnnouncements)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(clubAnnouncements.id, announcementId))
    .returning()
  return updated
}

/**
 * Cancella un annuncio
 */
export async function deleteClubAnnouncement(announcementId: number) {
  const db = await requireDb()
  await db.delete(clubAnnouncements).where(eq(clubAnnouncements.id, announcementId))
  return true
}

export async function getClubAnnouncementById(announcementId: number) {
  const db = await requireDb()
  const [announcement] = await db
    .select()
    .from(clubAnnouncements)
    .where(eq(clubAnnouncements.id, announcementId))
  return announcement
}

// ============================================
// CLUB MEDIA GALLERY
// ============================================

/**
 * Carica un media nella galleria del club
 */
export async function uploadClubMedia(params: {
  clubId: number
  uploaderId: number
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl?: string
  caption?: string
  eventId?: number
}) {
  const db = await requireDb()
  const [media] = await db.insert(clubMedia).values(params).returning()
  return media
}

/**
 * Ottiene media di un club
 */
export async function getClubMediaGallery(params: {
  clubId: number
  mediaType?: 'image' | 'video'
  eventId?: number
  limit?: number
  offset?: number
}) {
  const db = await requireDb()
  const conditions = [eq(clubMedia.clubId, params.clubId)]
  
  if (params.mediaType) {
    conditions.push(eq(clubMedia.mediaType, params.mediaType))
  }
  
  if (params.eventId) {
    conditions.push(eq(clubMedia.eventId, params.eventId))
  }
  
  const media = await db
    .select({
      media: clubMedia,
      uploader: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
    })
    .from(clubMedia)
    .innerJoin(users, eq(clubMedia.uploaderId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(and(...conditions))
    .orderBy(desc(clubMedia.createdAt))
    .limit(params.limit || 50)
    .offset(params.offset || 0)
  
  return media
}

/**
 * Cancella un media
 */
export async function deleteClubMedia(mediaId: number) {
  const db = await requireDb()
  await db.delete(clubMedia).where(eq(clubMedia.id, mediaId))
  return true
}

export async function getClubMediaById(mediaId: number) {
  const db = await requireDb()
  const [media] = await db
    .select()
    .from(clubMedia)
    .where(eq(clubMedia.id, mediaId))
  return media
}

// ============================================
// POST REACTIONS
// ============================================

/**
 * Aggiunge o aggiorna una reazione ad un post
 */
export async function togglePostReaction(params: {
  postId: number
  userId: number
  reactionType: 'splash' | 'fire' | 'strong' | 'clap' | 'wave' | 'love' | 'rocket' | 'wow' | 'laugh' | 'cry'
}) {
  const db = await requireDb()
  
  // Verifica se esiste già una reazione
  const [existing] = await db
    .select()
    .from(postReactions)
    .where(and(
      eq(postReactions.postId, params.postId),
      eq(postReactions.userId, params.userId)
    ))
  
  if (existing) {
    if (existing.reactionType === params.reactionType) {
      // Rimuovi la reazione se è la stessa
      await db
        .delete(postReactions)
        .where(eq(postReactions.id, existing.id))
      return null
    } else {
      // Aggiorna il tipo di reazione
      const [updated] = await db
        .update(postReactions)
        .set({ reactionType: params.reactionType, createdAt: new Date() })
        .where(eq(postReactions.id, existing.id))
        .returning()
      return updated
    }
  } else {
    // Inserisci nuova reazione
    const [reaction] = await db
      .insert(postReactions)
      .values(params)
      .returning()
    return reaction
  }
}

/**
 * Ottiene reazioni di un post raggruppate per tipo
 */
export async function getPostReactions(postId: number) {
  const db = await requireDb()
  const reactions = await db
    .select({
      reactionType: postReactions.reactionType,
      count: sql<number>`COUNT(*)::int`,
      users: sql<Array<{ userId: number; username: string | null; profilePicture: string | null }>>`
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'userId', ${users.id},
            'username', ${swimmerProfiles.username},
            'profilePicture', ${swimmerProfiles.avatarUrl}
          )
        )
      `,
    })
    .from(postReactions)
    .innerJoin(users, eq(postReactions.userId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(eq(postReactions.postId, postId))
    .groupBy(postReactions.reactionType)
  
  return reactions
}

/**
 * Verifica se un utente ha reagito ad un post
 */
export async function getUserPostReaction(postId: number, userId: number) {
  const db = await requireDb()
  const [reaction] = await db
    .select()
    .from(postReactions)
    .where(and(
      eq(postReactions.postId, postId),
      eq(postReactions.userId, userId)
    ))
  
  return reaction || null
}
