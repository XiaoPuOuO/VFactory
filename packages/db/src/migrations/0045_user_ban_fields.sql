-- 用戶封禁：banned_at、banned_until、ban_reason；封禁後無法登入，登入時顯示理由。
-- banned_until 為 null 表示永久封禁。
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned_at" timestamp with time zone;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned_until" timestamp with time zone;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "ban_reason" text;
