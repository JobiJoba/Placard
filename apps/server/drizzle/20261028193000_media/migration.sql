CREATE TABLE "media" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"place_id" text NOT NULL,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"thumb_path" text,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("kind" in ('dish', 'photo', 'attachment'));--> statement-breakpoint
CREATE INDEX "media_place_id_idx" ON "media" ("place_id");--> statement-breakpoint
CREATE INDEX "media_owner_place_idx" ON "media" ("owner_id","place_id");
