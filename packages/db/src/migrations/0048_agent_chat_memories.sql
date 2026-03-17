-- Agent 跨聊天記憶（以 agent 隔離，不同 agent UUID 之間不互通）
CREATE TABLE IF NOT EXISTS "agent_chat_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "source_room_id" uuid REFERENCES "chat_rooms"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_chat_memories_company_agent_created_idx" ON "agent_chat_memories" ("company_id", "agent_id", "created_at" DESC);
