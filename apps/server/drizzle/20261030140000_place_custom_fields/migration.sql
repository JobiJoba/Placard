CREATE TABLE "place_custom_fields" (
  "id" text PRIMARY KEY NOT NULL,
  "place_id" text NOT NULL,
  "label" text NOT NULL,
  "label_key" text NOT NULL,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_custom_fields" ADD CONSTRAINT "place_custom_fields_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "place_custom_fields" ADD CONSTRAINT "place_custom_fields_type_check" CHECK ("type" in ('text', 'email', 'url', 'phone', 'number', 'date'));
--> statement-breakpoint
CREATE INDEX "place_custom_fields_place_id_idx" ON "place_custom_fields" ("place_id");
--> statement-breakpoint
CREATE INDEX "place_custom_fields_label_key_idx" ON "place_custom_fields" ("label_key");
--> statement-breakpoint
CREATE INDEX "place_custom_fields_label_key_value_idx" ON "place_custom_fields" ("label_key", "value");
