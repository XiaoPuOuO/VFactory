DO $$ BEGIN
  CREATE TYPE "schedule_kind" AS ENUM('cron', 'once', 'ranges');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "agent_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "agent_id" uuid NOT NULL REFERENCES "agents"("id"),
  "name" text NOT NULL,
  "schedule_kind" "schedule_kind" NOT NULL,
  "timezone" text NOT NULL,
  "payload" jsonb,
  "enabled" boolean DEFAULT true NOT NULL,
  "next_run_at" timestamp with time zone,
  "last_triggered_at" timestamp with time zone,
  "cron_expression" text,
  "run_at" timestamp with time zone,
  "time_of_day" text,
  "windows" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_schedules_company_enabled_next_run_idx" ON "agent_schedules" ("company_id", "enabled", "next_run_at");
CREATE INDEX IF NOT EXISTS "agent_schedules_agent_idx" ON "agent_schedules" ("agent_id");
