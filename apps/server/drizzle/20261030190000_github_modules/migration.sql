ALTER TABLE "instance_settings" ADD COLUMN "module_update_check_hours" integer DEFAULT 24 NOT NULL;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "github_owner" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "github_repo" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "github_repo_url" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "github_release_tag" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "github_asset_name" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "latest_available_version" text;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "update_available" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "instance_modules" ADD COLUMN "update_checked_at" timestamp with time zone;
