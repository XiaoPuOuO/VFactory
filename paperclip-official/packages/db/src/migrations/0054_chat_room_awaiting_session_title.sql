ALTER TABLE "chat_rooms" ADD COLUMN IF NOT EXISTS "awaiting_session_title" boolean DEFAULT false NOT NULL;
