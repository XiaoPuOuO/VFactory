ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "execution_policy" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "execution_label" text;
