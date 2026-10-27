CREATE TABLE "list_items" (
	"list_id" text,
	"place_id" text,
	"position" integer,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_items_pkey" PRIMARY KEY("list_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_visibility_check" CHECK ("visibility" in ('private'))
);
--> statement-breakpoint
CREATE TABLE "place_tags" (
	"place_id" text,
	"tag_id" text,
	CONSTRAINT "place_tags_pkey" PRIMARY KEY("place_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "manual_fields" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "list_items_place_id_idx" ON "list_items" ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_owner_name_idx" ON "lists" ("owner_id",lower("name"));--> statement-breakpoint
CREATE INDEX "place_tags_tag_id_idx" ON "place_tags" ("tag_id");--> statement-breakpoint
CREATE INDEX "places_deleted_at_idx" ON "places" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_owner_name_idx" ON "tags" ("owner_id",lower("name"));--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_place_id_places_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "place_tags" ADD CONSTRAINT "place_tags_tag_id_tags_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;