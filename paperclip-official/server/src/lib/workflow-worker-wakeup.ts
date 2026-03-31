import type { ChatHeartbeat } from "../services/chat.js";

function isWorkflowTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * worker-step-result 成功後喚醒同一 agent，維持 chat:${roomId} task session，銜接下一輪 heartbeat。
 * 終止狀態時附帶 paperclipWorkflowTerminalReportDue，提示詞要求 POST 一則使用者總結。
 */
export async function wakeAgentAfterWorkflowWorkerStep(
  heartbeat: ChatHeartbeat,
  run: {
    id: string;
    agentId: string | null;
    chatRoomId: string | null;
    status: string;
    updatedAt: Date;
  },
): Promise<void> {
  if (!run.agentId || !run.chatRoomId) return;
  const roomId = run.chatRoomId;
  const terminal = isWorkflowTerminalStatus(run.status);
  const ts = run.updatedAt instanceof Date ? run.updatedAt.getTime() : Date.now();
  await heartbeat.wakeup(run.agentId, {
    source: "automation",
    triggerDetail: terminal ? "workflow_terminal" : "workflow_continue",
    reason: terminal ? "workflow_run_terminal_report" : "workflow_run_continue",
    contextSnapshot: {
      roomId,
      chatRoomId: roomId,
      taskKey: `chat:${roomId}`,
      chatMode: "light",
      paperclipWorkflowTerminalReportDue: terminal,
      workflowRunId: run.id,
    },
    idempotencyKey: terminal ? `workflow:terminal:${run.id}:${ts}` : `workflow:continue:${run.id}:${ts}`,
  });
}
