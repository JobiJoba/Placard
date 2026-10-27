CREATE TABLE "enrichment_runs" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "enrichment_runs_status_check" CHECK ("status" in ('running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "place_facts" (
	"place_id" text,
	"key" text,
	"value" jsonb NOT NULL,
	"source" text,
	"is_override" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_facts_pkey" PRIMARY KEY("place_id","key","source"),
	CONSTRAINT "place_facts_source_check" CHECK ("source" in ('google', 'manual', 'takeout'))
);
--> statement-breakpoint
CREATE INDEX "enrichment_runs_owner_created_idx" ON "enrichment_runs" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "place_facts_place_id_idx" ON "place_facts" ("place_id");--> statement-breakpoint
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_facts" ADD CONSTRAINT "place_facts_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;