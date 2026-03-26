/**
 * 排程類型：cron 重複、單次指定時刻、多段日期區間內每日
 */
export type ScheduleKind = "cron" | "once" | "ranges";

/** 日期區間視窗（該時區的「日」YYYY-MM-DD） */
export type ScheduleWindow = { start: string; end: string };

export type SkillInvocationPayload = {
  /**
   * Skill name (kebab-case, lowercase recommended).
   */
  name: string;
  /**
   * Positional args tokens (string form).
   */
  args: string[];
};

/**
 * Schedule payload is an open record, but we standardize the optional
 * `skillInvocations` entry to enable schedule-driven skill injection.
 */
export type SchedulePayload = Record<string, unknown> & {
  skillInvocations?: SkillInvocationPayload[];
};

/** GET .../schedules/conflicts 單筆（同 agent 兩排程未來觸發過近） */
export type ScheduleConflictRow = {
  agentId: string;
  scheduleIdA: string;
  scheduleIdB: string;
  nextFireAtA: string;
  nextFireAtB: string;
  deltaSec: number;
};

export type AgentSchedule = {
  id: string;
  companyId: string;
  agentId: string;
  name: string;
  scheduleKind: ScheduleKind;
  timezone: string;
  payload: SchedulePayload | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  cronExpression: string | null;
  runAt: string | null;
  timeOfDay: string | null;
  windows: ScheduleWindow[] | null;
  createdAt: string;
  updatedAt: string;
};
