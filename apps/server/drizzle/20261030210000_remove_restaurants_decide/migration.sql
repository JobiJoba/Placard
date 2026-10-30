-- Decide is no longer a bundled first-party module (prefer external Pick / Marketplace installs).
DELETE FROM "user_module_prefs" WHERE "module_id" = 'restaurants.decide';
--> statement-breakpoint
DELETE FROM "instance_modules" WHERE "module_id" = 'restaurants.decide';
