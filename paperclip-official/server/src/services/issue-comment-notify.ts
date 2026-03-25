import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, authUsers } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { scheduleCompanyNotificationEvent } from "./company-notification-dispatch.js";
import { issueService } from "./issues.js";

/**
 * 議題新留言後：合併訂閱者與 @人類（排除作者），觸發 issue.comment_created 出站通知。
 */
export async function notifyIssueCommentCreated(
  db: Db,
  params: {
    companyId: string;
    issueId: string;
    issueIdentifier: string | null;
    issueTitle: string;
    commentId: string;
    commentBody: string;
    bodySnippet: string;
    authorUserId: string | null;
    authorAgentId: string | null;
  },
): Promise<void> {
  const svc = issueService(db);
  let mentionedUserIds: string[] = [];
  try {
    mentionedUserIds = await svc.findMentionedUsers(params.companyId, params.commentBody);
  } catch (err) {
    logger.warn({ err, issueId: params.issueId }, "findMentionedUsers failed");
  }
  let subscriberIds: string[] = [];
  try {
    subscriberIds = await svc.listIssueSubscriberUserIds(params.issueId);
  } catch (err) {
    logger.warn({ err, issueId: params.issueId }, "listIssueSubscriberUserIds failed");
  }

  const recipientSet = new Set<string>([...mentionedUserIds, ...subscriberIds]);
  if (params.authorUserId) recipientSet.delete(params.authorUserId);
  const recipientUserIds = [...recipientSet];

  let authorLabel = "Someone";
  if (params.authorUserId) {
    const u = await db
      .select({ name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, params.authorUserId))
      .then((r) => r[0] ?? null);
    if (u) authorLabel = u.name;
  } else if (params.authorAgentId) {
    const a = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, params.authorAgentId))
      .then((r) => r[0] ?? null);
    if (a) authorLabel = a.name;
  }

  const base = (process.env.PAPERCLIP_PUBLIC_URL ?? "http://localhost:3100").replace(/\/$/, "");
  scheduleCompanyNotificationEvent(db, params.companyId, "issue.comment_created", {
    issueId: params.issueId,
    commentId: params.commentId,
    issueRef: params.issueIdentifier ?? params.issueId,
    issueTitle: params.issueTitle,
    bodySnippet: params.bodySnippet,
    authorLabel,
    authorUserId: params.authorUserId,
    authorAgentId: params.authorAgentId,
    issueUrl: `${base}/issues/${params.issueId}`,
    recipientUserIds,
  });
}
