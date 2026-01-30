-- Social Community (Feed/Splash/Comment/Follows)
ALTER TABLE "swimming_activities"
  ADD COLUMN IF NOT EXISTS "share_to_feed" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "activity_id" integer,
  "content" text,
  "media_url" text,
  "visibility" varchar(20) NOT NULL DEFAULT 'public',
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_activity_id_idx"
  ON "social_posts"("activity_id")
  WHERE "activity_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "social_splashes" (
  "id" serial PRIMARY KEY,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_splashes_unique"
  ON "social_splashes"("post_id", "user_id");

CREATE INDEX IF NOT EXISTS "social_splashes_post_id_idx"
  ON "social_splashes"("post_id");

CREATE TABLE IF NOT EXISTS "social_comments" (
  "id" serial PRIMARY KEY,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "social_comments_post_id_idx"
  ON "social_comments"("post_id");

CREATE TABLE IF NOT EXISTS "social_follows" (
  "id" serial PRIMARY KEY,
  "follower_id" integer NOT NULL,
  "following_id" integer NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'accepted',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_follows_unique"
  ON "social_follows"("follower_id", "following_id");
