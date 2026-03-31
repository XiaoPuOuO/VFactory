import type { Db } from "@paperclipai/db";
import type { approvals } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { heartbeatService } from "./heartbeat.js";
import { issueApprovalService } from "./issue-approvals.js";
import type { StorageService } from "../storage/types.js";

type ApprovalRow = typeof approvals.$inferSelect;

/**
 * 核准通過後之 activity 與請求者喚醒（與 POST /approvals/:id/approve 行為一致）。
 * `hire_agent` 不會喚醒請求者：避免同一聊天請求在第二次 heartbeat 再次 POST .../agent-hires 造成重複建立。
 */
export async function runApprovalApprovedFollowUp(
  db: Db,
  approval: ApprovalRow,
  actor: { userId: string | null; label: "user" | "policy" },
  storage?: StorageService,
): Promise<void> {
  const heartbeat = heartbeatService(db, storage);
  const issueApprovalsSvc = issueApprovalService(db);

  const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(approval.id);
  const linkedIssueIds = linkedIssues.map((issue) => issue.id);
  const primaryIssueId = linkedIssueIds[0] ?? null;

  const actorId =
    actor.label === "policy" ? "policy" : actor.userId ?? "board";
  const actorType = actor.label === "policy" ? ("system" as const) : ("user" as const);

  await logActivity(db, {
    companyId: approval.companyId,
    actorType,
    actorId,
    action: "approval.approved",
    entityType: "approval",
    entityId: approval.id,
    details: {
      type: approval.type,
      requestedByAgentId: approval.requestedByAgentId,
      linkedIssueIds,
      decisionSource: approval.decisionSource,
      policyId: approval.policyId,
    },
  });

  if (!approval.requestedByAgentId) return;

  // hire_agent: the agent row is already created/activated in approvalService.approve().
  // Waking the requester again often causes a second POST .../agent-hires in the next heartbeat
  // (duplicate hire for the same chat request). Board/UI notifications remain sufficient.
  if (approval.type === "hire_agent") {
    return;
  }

  try {
    const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
      source: "automation",
      triggerDetail: "system",
      reason: "approval_approved",
      payload: {
        approvalId: approval.id,
        approvalStatus: approval.status,
        issueId: primaryIssueId,
        issueIds: linkedIssueIds,
      },
      requestedByActorType: actor.label === "policy" ? "user" : "user",
      requestedByActorId: actor.userId ?? "board",
      contextSnapshot: {
        source: "approval.approved",
        approvalId: approval.id,
        approvalStatus: approval.status,
        issueId: primaryIssueId,
        issueIds: linkedIssueIds,
        taskId: primaryIssueId,
        wakeReason: "approval_approved",
      },
    });

    await logActivity(db, {
      companyId: approval.companyId,
      actorType,
      actorId,
      action: "approval.requester_wakeup_queued",
      entityType: "approval",
      entityId: approval.id,
      details: {
        requesterAgentId: approval.requestedByAgentId,
        wakeRunId: wakeRun?.id ?? null,
        linkedIssueIds,
      },
    });
  } catch (err) {
    logger.warn(
      {
        err,
        approvalId: approval.id,
        requestedByAgentId: approval.requestedByAgentId,
      },
      "failed to queue requester wakeup after approval",
    );
    await logActivity(db, {
      companyId: approval.companyId,
      actorType,
      actorId,
      action: "approval.requester_wakeup_failed",
      entityType: "approval",
      entityId: approval.id,
      details: {
        requesterAgentId: approval.requestedByAgentId,
        linkedIssueIds,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
