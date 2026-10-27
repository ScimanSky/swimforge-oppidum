CREATE TABLE "user_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"category" varchar(32) DEFAULT 'distance' NOT NULL,
	"target_value" real,
	"unit" varchar(24),
	"current_value" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_user_goals_user" ON "user_goals" USING btree ("user_id");