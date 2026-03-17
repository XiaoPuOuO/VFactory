CREATE TABLE IF NOT EXISTS "chat_list_preferences" (
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "entity_id" text NOT NULL,
  "note" text,
  "pinned_order" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_list_preferences_company_entity_idx" ON "chat_list_preferences" ("company_id", "entity_id");
