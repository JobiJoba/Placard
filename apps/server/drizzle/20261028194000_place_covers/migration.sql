ALTER TABLE "media" ADD COLUMN "origin" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_origin_check" CHECK ("origin" in ('user', 'google'));--> statement-breakpoint
CREATE UNIQUE INDEX "media_place_google_origin_idx" ON "media" ("place_id") WHERE "origin" = 'google';--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "cover_media_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "places_cover_media_id_idx" ON "places" ("cover_media_id");
