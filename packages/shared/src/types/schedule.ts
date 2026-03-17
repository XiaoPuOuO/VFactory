/**
 * 排程類型：cron 重複、單次指定時刻、多段日期區間內每日
 */
export type ScheduleKind = "cron" | "once" | "ranges";

/** 日期區間視窗（該時區的「日」YYYY-MM-DD） */
export type ScheduleWindow = { start: string; end: string };

export type AgentSchedule = {
  id: string;
  companyId: string;
  agentId: string;
  name: string;
  scheduleKind: ScheduleKind;
  timezone: string;
  payload: Record<string, unknown> | null;
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
