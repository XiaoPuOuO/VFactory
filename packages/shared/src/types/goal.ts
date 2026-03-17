import type { GoalLevel, GoalRecurrence, GoalStatus } from "../constants.js";

export interface Goal {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  level: GoalLevel;
  status: GoalStatus;
  parentId: string | null;
  ownerAgentId: string | null;
  /** 一次性完成即 achieved；daily/weekly/monthly/custom 為定期刷新，完成後等待 interval 再下一週期 */
  recurrence: GoalRecurrence;
  recurrenceIntervalDays: number;
  recurrenceIntervalHours: number;
  recurrenceIntervalMinutes: number;
  recurrenceIntervalSeconds: number;
  /** 定期目標下次刷新時間；now >= 此值時視為進入新週期 */
  recurrenceNextRefreshAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
