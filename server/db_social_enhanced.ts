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
import { and, eq, desc, sql, gte, lte, or, isNull } from "drizzle-orm"

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>

async function requireDb(): Promise<DbClient> {
  const db = await getDb()
  if (!db) throw new Error("Database not available")
  return db
}

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
  startTime: Date
  endTime?: Date
  maxAttendees?: number
  isRecurring?: boolean
  recurringRule?: string
  coverImageUrl?: string
}) {
  const db = await requireDb()
  const [event] = await db.insert(clubEvents).values(params).returning()
  return event
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
  
  const events = await db
    .select({
      event: clubEvents,
      creator: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
      attendeeCount: sql<number>`COUNT(DISTINCT ${eventAttendees.id})::int`,
    })
    .from(clubEvents)
    .leftJoin(users, eq(clubEvents.creatorId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .leftJoin(eventAttendees, and(
      eq(eventAttendees.eventId, clubEvents.id),
      eq(eventAttendees.status, 'going')
    ))
    .where(and(...conditions))
    .groupBy(clubEvents.id, users.id, swimmerProfiles.userId, swimmerProfiles.username, swimmerProfiles.avatarUrl)
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
}) {
  const db = await requireDb()
  const [message] = await db.insert(directMessages).values(params).returning()
  return message
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
  const messages = await db
    .select({
      message: directMessages,
      sender: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
    })
    .from(directMessages)
    .innerJoin(users, eq(directMessages.senderId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(
      or(
        and(
          eq(directMessages.senderId, params.userId1),
          eq(directMessages.receiverId, params.userId2)
        ),
        and(
          eq(directMessages.senderId, params.userId2),
          eq(directMessages.receiverId, params.userId1)
        )
      )
    )
    .orderBy(desc(directMessages.createdAt))
    .limit(params.limit || 50)
    .offset(params.offset || 0)
  
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
  
  // Query per ottenere l'ultimo messaggio per ogni conversazione
  const conversations = await db
    .select({
      lastMessage: directMessages,
      otherUser: {
        id: users.id,
        username: swimmerProfiles.username,
        profilePicture: swimmerProfiles.avatarUrl,
      },
      unreadCount: sql<number>`
        COUNT(CASE WHEN ${directMessages.receiverId} = ${userId} 
                   AND ${directMessages.isRead} = false 
                   THEN 1 END)::int
      `,
    })
    .from(directMessages)
    .innerJoin(
      users,
      sql`${users.id} = CASE 
        WHEN ${directMessages.senderId} = ${userId} THEN ${directMessages.receiverId}
        ELSE ${directMessages.senderId}
      END`
    )
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(
      or(
        eq(directMessages.senderId, userId),
        eq(directMessages.receiverId, userId)
      )
    )
    .groupBy(directMessages.id, users.id, swimmerProfiles.userId, swimmerProfiles.username, swimmerProfiles.avatarUrl)
    .orderBy(desc(directMessages.createdAt))
    .limit(limit)
  
  return conversations
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
  const conditions = [eq(userNotifications.userId, params.userId)]
  
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
  
  const conditions = [eq(userNotifications.userId, userId)]
  if (notificationIds && notificationIds.length > 0) {
    conditions.push(sql`${userNotifications.id} = ANY(${notificationIds})`)
  }
  
  await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(...conditions))
  
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
        eq(userNotifications.isRead, false)
      )
    )
  
  return result?.count || 0
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

// ============================================
// POST REACTIONS
// ============================================

/**
 * Aggiunge o aggiorna una reazione ad un post
 */
export async function togglePostReaction(params: {
  postId: number
  userId: number
  reactionType: 'splash' | 'fire' | 'strong' | 'clap' | 'wave'
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
