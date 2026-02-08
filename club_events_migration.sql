-- Add club events tables
-- Migration for club events feature

-- Create community_club_events table
CREATE TABLE IF NOT EXISTS community_club_events (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES community_clubs(id) ON DELETE CASCADE,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) NOT NULL,
  location TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  max_attendees INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create community_event_rsvps table
CREATE TABLE IF NOT EXISTS community_event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES community_club_events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Status must match the Zod enum in server/routers.ts clubs.events.rsvp (going, maybe, not_going)
  status VARCHAR(20) NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(event_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_club_events_club_id ON community_club_events(club_id);
CREATE INDEX IF NOT EXISTS idx_club_events_start_time ON community_club_events(start_time);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON community_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON community_event_rsvps(user_id);
