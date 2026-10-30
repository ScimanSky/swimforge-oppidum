-- Deleting an account must never delete what other users have: until now the foreign keys to
-- users cascaded a club owner's deletion to the whole club (members, events and their attendees,
-- announcements, everyone's gallery, invites, club posts) and a challenge creator's deletion to
-- every participant's progress.
--
-- - community_clubs.owner_id      → ON DELETE RESTRICT: the app transfers or deletes the club
--   first (a club with other active members blocks the account deletion until it is transferred).
-- - challenges.creator_id, club_events.creator_id, community_club_invites.inviter_id → ON DELETE
--   SET NULL, the columns nullable: the challenge, the event and the invite stay.
-- - social_posts.club_id had two foreign keys, one CASCADE and one SET NULL: only SET NULL stays.
--
-- Constraint names differ between databases (migrations 0013-0016, the legacy foreign-key script,
-- hand-made fixes): every block looks the constraint up in pg_constraint by table, column and
-- referenced table, drops the ones with another ON DELETE action and adds the right one when it
-- is missing. Idempotent: safe to run more than once. Tables missing on a database are skipped.
DO $$
BEGIN
  IF to_regclass('public.challenges') IS NOT NULL THEN
    ALTER TABLE public.challenges ALTER COLUMN creator_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.club_events') IS NOT NULL THEN
    ALTER TABLE public.club_events ALTER COLUMN creator_id DROP NOT NULL;
  END IF;
  IF to_regclass('public.community_club_invites') IS NOT NULL THEN
    ALTER TABLE public.community_club_invites ALTER COLUMN inviter_id DROP NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
-- community_clubs.owner_id → users.id: ON DELETE RESTRICT.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.community_clubs') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.community_clubs'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'owner_id'
      AND c.confdeltype <> 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.community_clubs DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.community_clubs'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'owner_id'
      AND c.confdeltype = 'r'
  ) THEN
    ALTER TABLE public.community_clubs
      ADD CONSTRAINT community_clubs_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint
-- challenges.creator_id → users.id: ON DELETE SET NULL.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.challenges') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.challenges'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'creator_id'
      AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE public.challenges DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.challenges'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'creator_id'
      AND c.confdeltype = 'n'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
-- club_events.creator_id → users.id: ON DELETE SET NULL.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.club_events') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.club_events'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'creator_id'
      AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE public.club_events DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.club_events'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'creator_id'
      AND c.confdeltype = 'n'
  ) THEN
    ALTER TABLE public.club_events
      ADD CONSTRAINT fk_club_events_creator_id
      FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
-- community_club_invites.inviter_id → users.id: ON DELETE SET NULL.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.community_club_invites') IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.community_club_invites'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'inviter_id'
      AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE public.community_club_invites DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.community_club_invites'::regclass
      AND c.confrelid = 'public.users'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'inviter_id'
      AND c.confdeltype = 'n'
  ) THEN
    ALTER TABLE public.community_club_invites
      ADD CONSTRAINT community_club_invites_inviter_id_fkey
      FOREIGN KEY (inviter_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
-- social_posts.club_id → community_clubs.id: only the SET NULL foreign key stays.
DO $$
DECLARE
  fk record;
BEGIN
  IF to_regclass('public.social_posts') IS NULL OR to_regclass('public.community_clubs') IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.social_posts'::regclass
      AND c.confrelid = 'public.community_clubs'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'club_id'
      AND c.confdeltype <> 'n'
  LOOP
    EXECUTE format('ALTER TABLE public.social_posts DROP CONSTRAINT %I', fk.conname);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.social_posts'::regclass
      AND c.confrelid = 'public.community_clubs'::regclass
      AND cardinality(c.conkey) = 1
      AND a.attname = 'club_id'
      AND c.confdeltype = 'n'
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT fk_social_posts_club_id
      FOREIGN KEY (club_id) REFERENCES public.community_clubs(id) ON DELETE SET NULL;
  END IF;
END $$;
