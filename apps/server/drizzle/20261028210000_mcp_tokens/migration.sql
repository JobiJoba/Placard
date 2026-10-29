CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_token_hash_idx" ON "api_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_owner_id_idx" ON "api_tokens" ("owner_id");--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE TABLE "mcp_audit" (
	"id" text PRIMARY KEY,
	"token_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_audit_owner_created_at_idx" ON "mcp_audit" ("owner_id", "created_at");--> statement-breakpoint
CREATE INDEX "mcp_audit_token_id_idx" ON "mcp_audit" ("token_id");--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_token_id_api_tokens_id_fkey" FOREIGN KEY ("token_id") REFERENCES "api_tokens"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_audit" ADD CONSTRAINT "mcp_audit_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;
