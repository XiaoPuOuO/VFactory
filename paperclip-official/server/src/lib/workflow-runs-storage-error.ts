import type { Response } from "express";
import { logger } from "../middleware/logger.js";

/**
 * 判斷是否為 workflow_runs 資料表尚未建立，或尚未套用 0053（欄位不符）等 schema 問題。
 * postgres.js 會帶上 PostgreSQL 的 `code`（如 42P01、42703）。可供單元測試與其他路由重用。
 */
export function isWorkflowRunsStorageSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/relation ["']workflow_runs["'] does not exist/i.test(msg)) return true;
  if (/workflow_runs/i.test(msg) && /does not exist/i.test(msg) && /column/i.test(msg)) return true;

  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: unknown }).code ?? "");
    if (code === "42P01" && /workflow_runs/i.test(msg)) return true;
    if (code === "42703" && /workflow_runs/i.test(msg)) return true;
  }
  return false;
}

/** 若為 schema 問題則已寫入 JSON 回應並回傳 true。 */
export function respondIfWorkflowRunsStorageUnavailable(err: unknown, res: Response): boolean {
  if (!isWorkflowRunsStorageSchemaError(err)) return false;

  logger.error(
    { err },
    "workflow_runs: storage schema missing or outdated; apply migrations 0052_workflow_runs and 0053_workflow_runs_invoke",
  );
  res.status(503).json({
    error:
      "工作流程執行紀錄儲存尚未就緒。請對資料庫套用待處理 migration（0052_workflow_runs、0053_workflow_runs_invoke），或確認 PAPERCLIP_MIGRATION_AUTO_APPLY／互動式套用已執行。",
    code: "WORKFLOW_RUNS_STORAGE_NOT_READY",
  });
  return true;
}
