ALTER TABLE "companies" ADD COLUMN "wakeups_paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "wakeups_paused_reason" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "maintenance_windows" jsonb;