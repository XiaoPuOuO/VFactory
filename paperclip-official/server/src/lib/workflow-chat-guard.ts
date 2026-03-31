import type { Request } from "express";
import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workflowRuns } from "@paperclipai/db";
import { conflict } from "../errors.js";

const WORKFLOW_TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

/**
 * Agent 在與 workflow 綁定之聊天室發言時：非終止 run 禁止 POST（中間步驟僅能 worker-step-result）。
 * Board 不受此限。除錯：X-Paperclip-Workflow-Chat-Override: 1 且 board local_implicit，或設 WORKFLOW_CHAT_AGENT_OVERRIDE=1 時 agent 可略過。
 */
export async function assertAgentChatAllowedForWorkflow(
  db: Db,
  req: Request,
  companyId: string,
  roomId: string,
  actorType: "board" | "agent",
  agentId: string | null,
): Promise<void> {
  if (actorType !== "agent" || !agentId) return;

  const overrideHeader = req.header("x-paperclip-workflow-chat-override")?.trim() === "1";
  if (overrideHeader && req.actor.type === "board" && req.actor.source === "local_implicit") {
    return;
  }
  if (overrideHeader && process.env.WORKFLOW_CHAT_AGENT_OVERRIDE === "1") {
    return;
  }

  const [row] = await db
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.companyId, companyId),
        eq(workflowRuns.chatRoomId, roomId),
        eq(workflowRuns.agentId, agentId),
        notInArray(workflowRuns.status, [...WORKFLOW_TERMINAL_STATUSES]),
      ),
    )
    .limit(1);

  if (row) {
    throw conflict(
      "Workflow run is still in progress; do not POST chat messages until the run completes. Use worker-step-result for intermediate steps; after completion, POST one summary to the user.",
    );
  }
}
