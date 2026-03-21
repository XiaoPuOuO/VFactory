import type { Approval } from "./approval.js";

/** 審批列於 Governance Hub 時附帶的 issue 關聯筆數（來自 issue_approvals）。 */
export interface ApprovalWithLinkedIssueCount extends Approval {
  linkedIssueCount: number;
}

/** GET /api/companies/:companyId/governance 回應。 */
export interface GovernanceHubSummary {
  pendingApprovals: ApprovalWithLinkedIssueCount[];
  recentEnacted: ApprovalWithLinkedIssueCount[];
}
