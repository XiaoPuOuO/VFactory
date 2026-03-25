import type { LimitBreachEvent } from "./cost.js";

/** 儀表板趨勢序列（每日 UTC 日界）。 */
export interface DashboardTrendsDay {
  date: string;
  issuesCreated: number;
  issuesCompleted: number;
  activeAgents: number;
  goalLinkedIssuesCompleted: number;
}

export interface DashboardTrends {
  companyId: string;
  days: number;
  series: DashboardTrendsDay[];
}

export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
  };
  /** 預算／上限治理可見性（與 Costs breach 同源）。 */
  governance: {
    /** 目前因個人月預算觸頂而暫停中的 agent 數。 */
    agentsPausedByBudgetCount: number;
    /** 最近 30 天內上限觸發紀錄（最多 8 筆）。 */
    recentBreaches: LimitBreachEvent[];
  };
  pendingApprovals: number;
}
