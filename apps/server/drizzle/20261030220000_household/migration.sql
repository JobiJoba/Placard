ALTER TABLE "instance_settings" ADD COLUMN "household_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "places" DROP CONSTRAINT "places_visibility_check";
--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_visibility_check" CHECK ("visibility" in ('private', 'household'));
--> statement-breakpoint
CREATE UNIQUE INDEX "places_household_google_place_id_idx" ON "places" ("google_place_id") WHERE "google_place_id" is not null and "visibility" = 'household' and "deleted_at" is null;
