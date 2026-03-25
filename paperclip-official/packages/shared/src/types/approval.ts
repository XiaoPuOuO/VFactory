import type { ApprovalDecisionSource, ApprovalStatus, ApprovalType } from "../constants.js";

export interface Approval {
  id: string;
  companyId: string;
  type: ApprovalType;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  status: ApprovalStatus;
  payload: Record<string, unknown>;
  decisionNote: string | null;
  decidedByUserId: string | null;
  /** 決策來源；既有資料預設視為 human。 */
  decisionSource: ApprovalDecisionSource;
  /** 命中之委任政策 id（刪除政策後仍可能保留於歷史）。 */
  policyId: string | null;
  policySnapshot: Record<string, unknown> | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalComment {
  id: string;
  companyId: string;
  approvalId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
