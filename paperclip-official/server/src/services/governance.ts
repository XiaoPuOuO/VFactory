import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvals, issueApprovals } from "@paperclipai/db";
import type { ApprovalWithLinkedIssueCount, GovernanceHubSummary } from "@paperclipai/shared";
import { redactEventPayload } from "../redaction.js";

const RECENT_ENACTED_LIMIT = 15;
const ACTIONABLE_STATUSES = ["pending", "revision_requested"] as const;
const ENACTED_TYPES = ["hire_agent", "approve_ceo_strategy"] as const;

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(row: T): T {
  return {
    ...row,
    payload: redactEventPayload(row.payload) ?? {},
  };
}

function toApprovalWithCount(
  row: typeof approvals.$inferSelect,
  linkedIssueCount: number,
): ApprovalWithLinkedIssueCount {
  const base = redactApprovalPayload(row);
  return { ...base, linkedIssueCount } as ApprovalWithLinkedIssueCount;
}

export function governanceService(db: Db) {
  return {
    hub: async (companyId: string): Promise<GovernanceHubSummary> => {
      const pendingRows = await db
        .select()
        .from(approvals)
        .where(
          and(eq(approvals.companyId, companyId), inArray(approvals.status, [...ACTIONABLE_STATUSES])),
        )
        .orderBy(desc(approvals.createdAt));

      const recentEnactedRows = await db
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.companyId, companyId),
            eq(approvals.status, "approved"),
            inArray(approvals.type, [...ENACTED_TYPES]),
          ),
        )
        .orderBy(desc(approvals.decidedAt))
        .limit(RECENT_ENACTED_LIMIT);

      const allIds = [
        ...pendingRows.map((r) => r.id),
        ...recentEnactedRows.map((r) => r.id),
      ];

      const countsByApprovalId = new Map<string, number>();
      if (allIds.length > 0) {
        const countRows = await db
          .select({
            approvalId: issueApprovals.approvalId,
            count: sql<number>`count(*)::int`,
          })
          .from(issueApprovals)
          .where(and(eq(issueApprovals.companyId, companyId), inArray(issueApprovals.approvalId, allIds)))
          .groupBy(issueApprovals.approvalId);
        for (const row of countRows) {
          countsByApprovalId.set(row.approvalId, Number(row.count));
        }
      }

      const mapWithCounts = (rows: typeof pendingRows): ApprovalWithLinkedIssueCount[] =>
        rows.map((r) => toApprovalWithCount(r, countsByApprovalId.get(r.id) ?? 0));

      return {
        pendingApprovals: mapWithCounts(pendingRows),
        recentEnacted: mapWithCounts(recentEnactedRows),
      };
    },
  };
}
