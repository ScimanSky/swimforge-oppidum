-- GDPR: user consent registry

CREATE TABLE IF NOT EXISTS "user_consents" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "consent_type" varchar(64) NOT NULL,
  "consent_version" varchar(32) NOT NULL,
  "granted" boolean NOT NULL DEFAULT false,
  "granted_at" timestamp,
  "withdrawn_at" timestamp,
  "ip_address" varchar(45),
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_consents_user_type_version_unique"
  ON "user_consents"("user_id", "consent_type", "consent_version");

CREATE INDEX IF NOT EXISTS "user_consents_user_id_idx"
  ON "user_consents"("user_id");

CREATE INDEX IF NOT EXISTS "user_consents_type_idx"
  ON "user_consents"("consent_type");

CREATE INDEX IF NOT EXISTS "user_consents_granted_idx"
  ON "user_consents"("granted");
