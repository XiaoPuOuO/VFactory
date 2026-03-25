import type { Db } from "@paperclipai/db";
import type { approvals } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logActivity } from "./activity-log.js";
import { heartbeatService } from "./heartbeat.js";
import { issueApprovalService } from "./issue-approvals.js";

type ApprovalRow = typeof approvals.$inferSelect;

/**
 * 核准通過後之 activity 與請求者喚醒（與 POST /approvals/:id/approve 行為一致）。
 */
export async function runApprovalApprovedFollowUp(
  db: Db,
  approval: ApprovalRow,
  actor: { userId: string | null; label: "user" | "policy" },
): Promise<void> {
  const heartbeat = heartbeatService(db);
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
