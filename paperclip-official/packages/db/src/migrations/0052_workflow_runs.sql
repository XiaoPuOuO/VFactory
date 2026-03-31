CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL,
  "workflow_name" varchar(128) NOT NULL,
  "skill_key" varchar(128) NOT NULL,
  "status" varchar(32) NOT NULL,
  "current_step_id" varchar(64),
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "pending_prompt" jsonb,
  "pending_checkpoint" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workflow_runs_company_id_idx" ON "workflow_runs" ("company_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_company_status_idx" ON "workflow_runs" ("company_id", "status");
CREATE INDEX IF NOT EXISTS "workflow_runs_company_workflow_name_idx" ON "workflow_runs" ("company_id", "workflow_name");
CREATE INDEX IF NOT EXISTS "workflow_runs_created_at_idx" ON "workflow_runs" ("company_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "workflow_step_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "step_id" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL,
  "input" text,
  "output" text,
  "meta" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "workflow_step_logs_run_id_idx" ON "workflow_step_logs" ("run_id");
