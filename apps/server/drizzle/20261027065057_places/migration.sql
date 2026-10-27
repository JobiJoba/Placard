CREATE TABLE "places" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"location" geography(Point,4326),
	"address" text,
	"google_place_id" text,
	"status" text,
	"notes" text,
	"utc_offset_minutes" integer,
	"source" text NOT NULL,
	"last_enriched_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_visibility_check" CHECK ("visibility" in ('private')),
	CONSTRAINT "places_category_check" CHECK ("category" in ('restaurant', 'cafe', 'bar', 'park', 'museum', 'cinema', 'hotel', 'trail', 'other')),
	CONSTRAINT "places_source_check" CHECK ("source" in ('manual', 'autocomplete', 'map_pick', 'takeout', 'mcp')),
	CONSTRAINT "places_status_check" CHECK ("status" in ('want_to_go', 'been_there'))
);
--> statement-breakpoint
CREATE INDEX "places_location_idx" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "places_name_trgm_idx" ON "places" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_owner_deleted_idx" ON "places" ("owner_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "places_owner_google_place_id_idx" ON "places" ("owner_id","google_place_id") WHERE "google_place_id" is not null and "deleted_at" is null;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;