CREATE TABLE "google_budget" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"monthly_limit_cents" integer,
	"pause_at_limit" boolean DEFAULT false NOT NULL,
	"use_free_allowance" boolean DEFAULT false NOT NULL,
	"tracking_since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_budget_single_row" CHECK ("id" = 1),
	CONSTRAINT "google_budget_nonnegative" CHECK ("monthly_limit_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "google_usage" (
	"id" text PRIMARY KEY,
	"month" text NOT NULL,
	"sku" text NOT NULL,
	"source" text NOT NULL,
	"session_hash" text,
	"succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "google_usage_month_idx" ON "google_usage" ("month");--> statement-breakpoint
CREATE INDEX "google_usage_session_idx" ON "google_usage" ("session_hash");
--> statement-breakpoint
INSERT INTO "google_budget" ("id") VALUES (1);
