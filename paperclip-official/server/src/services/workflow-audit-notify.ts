/**
 * Workflow 稽核事件：寫入結構化日誌（便於 SIEM / 匯出），並可選推送至 Webhook（Slack/自架等）。
 */
import { logger } from "../middleware/logger.js";

export type WorkflowAuditEvent =
  | {
      type: "workflow.run.started";
      companyId: string;
      runId: string;
      skillKey: string;
      workflowName: string;
    }
  | {
      type: "workflow.prompt.completed";
      companyId: string;
      runId: string;
      stepId: string;
      /** 因 `require_human_input: false` 由引擎自動填入 */
      autoFilled?: boolean;
    }
  | {
      type: "workflow.checkpoint.decided";
      companyId: string;
      runId: string;
      stepId: string;
      approve: boolean;
      /** 因 `require_human_confirm: false` 由引擎自動核准 */
      autoApproved?: boolean;
    }
  | { type: "workflow.run.cancelled"; companyId: string; runId: string }
  | { type: "workflow.run.terminal"; companyId: string; runId: string; status: string }
  | {
      type: "workflow.approval.denied";
      companyId: string;
      runId: string;
      stepId: string;
      /** Deny 附帶之原因，供 worker 重試同一步 */
      reason?: string;
    };

function webhookUrl(): string | undefined {
  const u = process.env.WORKFLOW_NOTIFY_WEBHOOK_URL?.trim();
  return u && u.length > 0 ? u : undefined;
}

/**
 * 發送稽核事件：一律經由 pino；若設定 WORKFLOW_NOTIFY_WEBHOOK_URL 則非同步 POST JSON（失敗僅 debug，不影響主流程）。
 */
export function emitWorkflowAuditEvent(event: WorkflowAuditEvent): void {
  logger.info({ audit: "workflow", ...event }, "workflow_audit");

  const url = webhookUrl();
  if (!url) return;

  const body = JSON.stringify(event);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch((err) => {
    logger.debug({ err, type: event.type }, "workflow_notify_webhook_failed");
  });
}
