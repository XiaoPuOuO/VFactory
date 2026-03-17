-- 使用者開發者模式旗標：預設 false，僅開啟時顯示進階功能（如 Agent API 金鑰）。
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "developer_mode" boolean NOT NULL DEFAULT false;

