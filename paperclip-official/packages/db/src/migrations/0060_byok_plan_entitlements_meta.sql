-- BYOK：擴充方案說明與平台配額示意欄位（JSONB merge；不覆寫既有 tokenLimit／priceLimitCents）
UPDATE "plans"
SET
  "description" = '自備 API Key（BYOK）：模型費用付給原廠。此方案含平台配額與團隊預算護欄（公平使用）。',
  "entitlements" = COALESCE("entitlements", '{}'::jsonb) || '{"tierKey":"free","billableRunsPerMonth":500,"editorSeatsIncluded":2,"concurrentRuns":1,"webhookDeliveriesPerMonth":2000}'::jsonb
WHERE "slug" = 'free';

UPDATE "plans"
SET
  "name" = 'Team',
  "description" = 'BYOK 預設，適合成長中團隊；較高平台執行配額與並發。模型費用仍由您的雲端帳單支付。',
  "entitlements" = COALESCE("entitlements", '{}'::jsonb) || '{"tierKey":"team","billableRunsPerMonth":50000,"editorSeatsIncluded":25,"concurrentRuns":5,"webhookDeliveriesPerMonth":100000}'::jsonb
WHERE "slug" = 'pro';
