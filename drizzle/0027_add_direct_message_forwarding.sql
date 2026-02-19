ALTER TABLE "direct_messages"
ADD COLUMN IF NOT EXISTS "message_type" varchar(32) NOT NULL DEFAULT 'text';

ALTER TABLE "direct_messages"
ADD COLUMN IF NOT EXISTS "metadata" jsonb;

UPDATE "direct_messages"
SET "message_type" = 'text'
WHERE "message_type" IS NULL;
