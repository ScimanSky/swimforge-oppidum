-- Migration: Add Enhanced Social Network Features for Club
-- Creato: 2026-02-08
-- Descrizione: Tabelle per eventi club, messaggi diretti, notifiche, annunci, galleria media e reazioni avanzate

-- ============================================
-- CLUB EVENTS (Eventi e allenamenti di club)
-- ============================================
CREATE TABLE IF NOT EXISTS "club_events" (
  "id" SERIAL PRIMARY KEY,
  "club_id" INTEGER NOT NULL,
  "creator_id" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "event_type" VARCHAR(30) DEFAULT 'training' NOT NULL,
  "location" TEXT,
  "location_lat" REAL,
  "location_lng" REAL,
  "start_time" TIMESTAMP NOT NULL,
  "end_time" TIMESTAMP,
  "max_attendees" INTEGER,
  "is_recurring" BOOLEAN DEFAULT FALSE NOT NULL,
  "recurring_rule" TEXT,
  "cover_image_url" TEXT,
  "status" VARCHAR(20) DEFAULT 'active' NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_club_events_club_id" ON "club_events"("club_id");
CREATE INDEX IF NOT EXISTS "idx_club_events_start_time" ON "club_events"("start_time");
CREATE INDEX IF NOT EXISTS "idx_club_events_status" ON "club_events"("status");

-- ============================================
-- EVENT ATTENDEES (Partecipanti agli eventi)
-- ============================================
CREATE TABLE IF NOT EXISTS "event_attendees" (
  "id" SERIAL PRIMARY KEY,
  "event_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "status" VARCHAR(20) DEFAULT 'going' NOT NULL,
  "rsvp_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE("event_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_event_attendees_event_id" ON "event_attendees"("event_id");
CREATE INDEX IF NOT EXISTS "idx_event_attendees_user_id" ON "event_attendees"("user_id");

-- ============================================
-- DIRECT MESSAGES (Messaggi diretti)
-- ============================================
CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" SERIAL PRIMARY KEY,
  "sender_id" INTEGER NOT NULL,
  "receiver_id" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "is_read" BOOLEAN DEFAULT FALSE NOT NULL,
  "read_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_direct_messages_sender" ON "direct_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "idx_direct_messages_receiver" ON "direct_messages"("receiver_id");
CREATE INDEX IF NOT EXISTS "idx_direct_messages_is_read" ON "direct_messages"("is_read");
CREATE INDEX IF NOT EXISTS "idx_direct_messages_created_at" ON "direct_messages"("created_at" DESC);

-- ============================================
-- USER NOTIFICATIONS (Sistema notifiche)
-- ============================================
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "type" VARCHAR(50) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "reference_id" INTEGER,
  "is_read" BOOLEAN DEFAULT FALSE NOT NULL,
  "read_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_id" ON "user_notifications"("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_notifications_is_read" ON "user_notifications"("is_read");
CREATE INDEX IF NOT EXISTS "idx_user_notifications_created_at" ON "user_notifications"("created_at" DESC);

-- ============================================
-- CLUB ANNOUNCEMENTS (Annunci importanti)
-- ============================================
CREATE TABLE IF NOT EXISTS "club_announcements" (
  "id" SERIAL PRIMARY KEY,
  "club_id" INTEGER NOT NULL,
  "author_id" INTEGER NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "is_pinned" BOOLEAN DEFAULT FALSE NOT NULL,
  "expires_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_club_announcements_club_id" ON "club_announcements"("club_id");
CREATE INDEX IF NOT EXISTS "idx_club_announcements_is_pinned" ON "club_announcements"("is_pinned");
CREATE INDEX IF NOT EXISTS "idx_club_announcements_created_at" ON "club_announcements"("created_at" DESC);

-- ============================================
-- CLUB MEDIA GALLERY (Galleria foto/video)
-- ============================================
CREATE TABLE IF NOT EXISTS "club_media" (
  "id" SERIAL PRIMARY KEY,
  "club_id" INTEGER NOT NULL,
  "uploader_id" INTEGER NOT NULL,
  "media_type" VARCHAR(20) NOT NULL,
  "media_url" TEXT NOT NULL,
  "thumbnail_url" TEXT,
  "caption" TEXT,
  "event_id" INTEGER,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_club_media_club_id" ON "club_media"("club_id");
CREATE INDEX IF NOT EXISTS "idx_club_media_event_id" ON "club_media"("event_id");
CREATE INDEX IF NOT EXISTS "idx_club_media_created_at" ON "club_media"("created_at" DESC);

-- ============================================
-- POST REACTIONS (Reazioni emotive avanzate)
-- ============================================
CREATE TABLE IF NOT EXISTS "post_reactions" (
  "id" SERIAL PRIMARY KEY,
  "post_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "reaction_type" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE("post_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_post_reactions_post_id" ON "post_reactions"("post_id");
CREATE INDEX IF NOT EXISTS "idx_post_reactions_user_id" ON "post_reactions"("user_id");

-- Commenti in italiano come da convenzione del codebase
-- Questa migrazione aggiunge le funzionalità social avanzate per trasformare 
-- la sezione club in un social network completo orientato al nuoto
