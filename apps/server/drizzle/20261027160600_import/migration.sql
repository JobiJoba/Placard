ALTER TABLE "places" ADD COLUMN "import_run_id" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "import_run_id" text;--> statement-breakpoint
CREATE INDEX "places_import_run_id_idx" ON "places" ("import_run_id");--> statement-breakpoint
CREATE INDEX "lists_import_run_id_idx" ON "lists" ("import_run_id");--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'parsing' NOT NULL,
	"source_fingerprint" text NOT NULL,
	"counts" jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_status_check" CHECK ("status" in ('parsing', 'triage', 'committing', 'done', 'undone', 'failed'));--> statement-breakpoint
CREATE INDEX "import_runs_owner_created_idx" ON "import_runs" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "import_runs_owner_fingerprint_idx" ON "import_runs" ("owner_id","source_fingerprint");--> statement-breakpoint
CREATE TABLE "import_entries" (
	"id" text PRIMARY KEY,
	"run_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"source_file" text NOT NULL,
	"source_list" text,
	"name" text,
	"address" text,
	"country_code" text,
	"note" text,
	"location" geography(Point, 4326),
	"google_maps_url" text,
	"cid" text,
	"feature_id" text,
	"saved_at" timestamp with time zone,
	"decision" text DEFAULT 'pending' NOT NULL,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"place_id" text
);
--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_run_id_import_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "import_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_decision_check" CHECK ("decision" in ('pending', 'keep', 'skip'));--> statement-breakpoint
ALTER TABLE "import_entries" ADD CONSTRAINT "import_entries_match_status_check" CHECK ("match_status" in ('unmatched', 'matched', 'needs_review', 'failed'));--> statement-breakpoint
CREATE INDEX "import_entries_run_id_idx" ON "import_entries" ("run_id");--> statement-breakpoint
CREATE INDEX "import_entries_owner_dedupe_idx" ON "import_entries" ("owner_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "import_entries_run_dedupe_idx" ON "import_entries" ("run_id","dedupe_key","source_file");--> statement-breakpoint
CREATE TABLE "import_skips" (
	"owner_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"skipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_skips_pkey" PRIMARY KEY("owner_id","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "import_skips" ADD CONSTRAINT "import_skips_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;
