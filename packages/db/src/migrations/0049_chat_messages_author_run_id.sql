-- Agent 發送訊息時若請求帶 X-Paperclip-Run-Id 則寫入此欄位，供 adapter 判斷本 run 是否已透過工具回覆，避免重複張貼。
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "author_run_id" text;
