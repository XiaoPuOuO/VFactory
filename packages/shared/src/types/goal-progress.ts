import type { GoalStatus } from "../constants.js";
import type { IssueStatus } from "../constants.js";

/** 與 ISSUE_STATUSES 對齊的議題狀態計數（缺漏狀態視為 0）。 */
export type GoalProgressIssueStatusCounts = Record<IssueStatus, number>;

export interface GoalProgressProjectRow {
  projectId: string;
  name: string;
  status: string;
  issueStatusCounts: GoalProgressIssueStatusCounts;
  issueTotal: number;
  /** 該專案在 cost_events 上以 project_id 歸因的支出（分）。 */
  spendCents: number;
}

export interface GoalProgressChildGoal {
  id: string;
  title: string;
  status: GoalStatus;
}

/** GET /api/goals/:goalId/progress 回應。 */
export interface GoalProgress {
  goalId: string;
  companyId: string;
  goalTitle: string;
  goalStatus: GoalStatus;
  /** 納入範圍之議題（goal 或連結專案下）依狀態計數。 */
  issueStatusCounts: GoalProgressIssueStatusCounts;
  issueTotal: number;
  /** cost_events：goal_id、納入專案、或納入議題歸因之加總（分）。 */
  spendCents: number;
  inputTokens: number;
  outputTokens: number;
  projects: GoalProgressProjectRow[];
  childGoals: GoalProgressChildGoal[];
}
