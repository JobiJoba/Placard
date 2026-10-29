ALTER TABLE "user_module_prefs" ADD COLUMN "mcp_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
DROP TABLE IF EXISTS "decide_picks";
--> statement-breakpoint
UPDATE "instance_modules" SET "version" = '0.2.0' WHERE "module_id" = 'restaurants.decide';
