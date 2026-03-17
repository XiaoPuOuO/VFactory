-- 聊天訊息可關聯專案：使用者選擇「針對某專案對話」時寫入，AI 可據此理解討論範圍。
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;
