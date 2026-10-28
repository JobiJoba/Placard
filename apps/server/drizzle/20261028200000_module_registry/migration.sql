CREATE TABLE "instance_modules" (
	"module_id" text PRIMARY KEY,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"package_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"load_error" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_module_prefs" (
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_module_prefs_user_id_module_id_pk" PRIMARY KEY("user_id","module_id")
);
--> statement-breakpoint
ALTER TABLE "user_module_prefs" ADD CONSTRAINT "user_module_prefs_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "instance_modules" ("module_id", "version", "source", "package_name", "enabled")
VALUES ('restaurants.decide', '0.1.0', 'bundled', '@placard/module-restaurants-decide', true);
