-- Goal custom recurrence: interval (days/hours/minutes/seconds) and next refresh time
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence_interval_days" integer DEFAULT 0 NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence_interval_hours" integer DEFAULT 0 NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence_interval_minutes" integer DEFAULT 0 NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence_interval_seconds" integer DEFAULT 0 NOT NULL;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "recurrence_next_refresh_at" timestamp with time zone;
