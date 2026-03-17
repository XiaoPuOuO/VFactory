-- Issue 若由聊天室建立，完成時可回報至該聊天室。
ALTER TABLE "issues"
  ADD COLUMN IF NOT EXISTS "source_chat_room_id" uuid REFERENCES "chat_rooms"("id") ON DELETE SET NULL;
