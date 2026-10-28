CREATE TABLE "decide_picks" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"place_id" text NOT NULL,
	"picked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decide_picks" ADD CONSTRAINT "decide_picks_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "decide_picks" ADD CONSTRAINT "decide_picks_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX "decide_picks_owner_picked_at_idx" ON "decide_picks" ("owner_id","picked_at");
