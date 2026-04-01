/**
 * 將「同一 agent 上等待 worker 的 workflow run」掛進 heartbeat context，
 * 讓 adapter／提示詞可於單次 session 內呼叫 worker-step-result API 接續步驟（見 ADR）。
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workflowRuns, type WorkflowPendingWorker } from "@paperclipai/db";

export type PaperclipWorkflowPendingWorkerContext = {
  runId: string;
  companyId: string;
  pendingWorker: WorkflowPendingWorker;
};

/**
 * 若該 agent 有任一筆 `waiting_worker` 的 workflow run，寫入 `context.paperclipWorkflowPendingWorker`。
 */
export async function attachWorkflowPendingWorkerContext(
  db: Db,
  agentId: string,
  context: Record<string, unknown>,
): Promise<void> {
  delete context.paperclipWorkflowPendingWorker;
  delete context.paperclipWorkflowSuppressChat;
  const rawRoomId = context.roomId;
  const chatRoomId = typeof rawRoomId === "string" && rawRoomId.trim().length > 0 ? rawRoomId : null;
  const [row] = await db
    .select({
      id: workflowRuns.id,
      companyId: workflowRuns.companyId,
      pendingWorker: workflowRuns.pendingWorker,
    })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.agentId, agentId),
        eq(workflowRuns.status, "waiting_worker"),
        chatRoomId ? eq(workflowRuns.chatRoomId, chatRoomId) : isNull(workflowRuns.chatRoomId),
      ),
    )
    .orderBy(desc(workflowRuns.updatedAt))
    .limit(1);
  if (!row?.pendingWorker) return;
  const payload: PaperclipWorkflowPendingWorkerContext = {
    runId: row.id,
    companyId: row.companyId,
    pendingWorker: row.pendingWorker,
  };
  context.paperclipWorkflowPendingWorker = payload;
  /** 與後端聊天硬性規則一致：adapter 提示詞／PAPERCLIP_WORKFLOW_SUPPRESS_CHAT。 */
  context.paperclipWorkflowSuppressChat = true;
}

/** 供 heartbeat 鏈式迴圈比對與輪詢，避免 worker-step-result 寫入延遲造成誤判卡住。 */
export function getWorkflowPendingWorkerKeyFromContext(context: Record<string, unknown>): string | null {
  const wfPending = context.paperclipWorkflowPendingWorker as PaperclipWorkflowPendingWorkerContext | undefined;
  if (!wfPending?.pendingWorker) return null;
  return `${wfPending.runId}:${wfPending.pendingWorker.stepId}:${wfPending.pendingWorker.createdAt}`;
}

/**
 * adapter.execute 回傳後，若 DB 尚未反映 worker-step-result，短暫輪詢直到 pending 鍵變化或逾時。
 */
export async function pollUntilWorkflowWorkerStepAdvances(
  db: Db,
  agentId: string,
  previousKey: string | null,
  opts: { maxMs: number; stepMs: number } = { maxMs: 2000, stepMs: 75 },
): Promise<void> {
  if (previousKey == null) return;
  const deadline = Date.now() + opts.maxMs;
  while (Date.now() < deadline) {
    const ctx: Record<string, unknown> = {};
    await attachWorkflowPendingWorkerContext(db, agentId, ctx);
    const nextKey = getWorkflowPendingWorkerKeyFromContext(ctx);
    if (nextKey !== previousKey) return;
    await new Promise((r) => setTimeout(r, opts.stepMs));
  }
}

function continuationMinimalEnv(): boolean {
  const v = process.env.HEARTBEAT_WORKFLOW_CONTINUATION_MINIMAL;
  return v === "1" || v === "true" || v === "yes";
}

export function buildWorkflowWorkerContinuationPromptBlock(
  pending: PaperclipWorkflowPendingWorkerContext,
): string {
  const p = pending.pendingWorker.payload?.trim() ?? "";
  if (continuationMinimalEnv()) {
    return (
      `\n\n---\n[Workflow worker]\n` +
      `Run \`${pending.runId}\` step \`${pending.pendingWorker.stepId}\` (${pending.pendingWorker.kind}). ` +
      `No chat POST while waiting_worker; submit worker-step-result for company \`${pending.companyId}\`.\n` +
      (p ? `Payload:\n${p}\n` : "")
    );
  }
  return (
    `\n\n---\n[Paperclip workflow worker]\n` +
    `Run \`${pending.runId}\` is waiting for this session to execute step \`${pending.pendingWorker.stepId}\` (kind: ${pending.pendingWorker.kind}).\n` +
    `While this run is non-terminal, do NOT call POST \`/api/companies/.../chat/rooms/.../messages\` (the server returns 409). Progress only via worker-step-result.\n` +
    `After you finish, submit a structured result with POST \`.../companies/${pending.companyId}/workflow-runs/${pending.runId}/worker-step-result\` ` +
    `using JSON body \`{ "schemaVersion": 1, "status": "ok", "outputs": { "text": "..." } }\` or \`{ "schemaVersion": 1, "status": "error", "error": "..." }\`.\n` +
    `When the workflow run reaches a terminal status (completed/failed/cancelled), you will be instructed to POST exactly one user-facing summary to the chat room.\n` +
    (p ? `Step payload:\n${p}\n` : "")
  );
}
