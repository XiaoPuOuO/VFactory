-- 父子工作流：invoke_workflow 步驟會建立子 run，並在子完成／失敗時恢復父 run。
ALTER TABLE "workflow_runs"
  ADD COLUMN IF NOT EXISTS "parent_run_id" uuid REFERENCES "workflow_runs"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "parent_invoke_step_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "pending_child_run_id" uuid REFERENCES "workflow_runs"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "workflow_runs_parent_run_id_idx" ON "workflow_runs" ("parent_run_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_pending_child_run_id_idx" ON "workflow_runs" ("pending_child_run_id");
