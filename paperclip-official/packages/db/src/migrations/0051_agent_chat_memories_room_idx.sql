CREATE INDEX IF NOT EXISTS "agent_chat_memories_company_agent_room_created_idx"
ON "agent_chat_memories" ("company_id", "agent_id", "source_room_id", "created_at" DESC);

