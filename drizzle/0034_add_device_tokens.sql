CREATE TABLE "device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(512) NOT NULL,
	"platform" varchar(16) NOT NULL,
	"app_version" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user" ON "device_tokens" USING btree ("user_id");