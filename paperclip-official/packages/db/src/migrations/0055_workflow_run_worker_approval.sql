ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "pending_approval" jsonb;
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "pending_worker" jsonb;
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "chat_room_id" uuid REFERENCES "chat_rooms"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "workflow_runs_chat_room_id_idx" ON "workflow_runs" ("chat_room_id");
