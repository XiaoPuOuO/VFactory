CREATE TABLE IF NOT EXISTS "chat_rooms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_rooms_company_idx" ON "chat_rooms" ("company_id");

CREATE TABLE IF NOT EXISTS "chat_room_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
  "member_type" text NOT NULL,
  "member_id" text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_room_members_room_idx" ON "chat_room_members" ("room_id");
CREATE UNIQUE INDEX IF NOT EXISTS "chat_room_members_room_type_member_unique" ON "chat_room_members" ("room_id", "member_type", "member_id");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_id" uuid NOT NULL REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "author_agent_id" uuid REFERENCES "agents"("id"),
  "author_user_id" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_messages_room_created_at_idx" ON "chat_messages" ("room_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_company_idx" ON "chat_messages" ("company_id");
