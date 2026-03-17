-- Goal recurrence: one_time (完成即 achieved) | daily | weekly | monthly (定期刷新，完成後等待下一週期)
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence" text DEFAULT 'one_time' NOT NULL;
