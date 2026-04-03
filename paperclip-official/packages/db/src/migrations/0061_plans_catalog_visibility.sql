-- 方案目錄可見性：公開列表 vs 僅允許名單內公司（企業定製／內部 Infinite 等）
ALTER TABLE "plans" ADD COLUMN "catalog_visible" boolean DEFAULT true NOT NULL;
ALTER TABLE "plans" ADD COLUMN "allowed_company_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
