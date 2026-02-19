-- Add session token version for global session invalidation

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_token_version" integer NOT NULL DEFAULT 1;
