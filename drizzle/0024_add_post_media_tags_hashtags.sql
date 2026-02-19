-- Social posts: media multipli, tag utenti e hashtag

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "media_urls" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "tagged_user_ids" integer[] NOT NULL DEFAULT '{}'::integer[];

ALTER TABLE "social_posts"
  ADD COLUMN IF NOT EXISTS "hashtags" text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS "social_posts_media_urls_idx"
  ON "social_posts" USING GIN ("media_urls");

CREATE INDEX IF NOT EXISTS "social_posts_tagged_user_ids_idx"
  ON "social_posts" USING GIN ("tagged_user_ids");

CREATE INDEX IF NOT EXISTS "social_posts_hashtags_idx"
  ON "social_posts" USING GIN ("hashtags");
