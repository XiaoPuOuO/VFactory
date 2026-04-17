export interface CostEvent {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  projectId: string | null;
  goalId: string | null;
  billingCode: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
  costCents: number;
  occurredAt: Date;
  createdAt: Date;
}

/** 上限觸發類型（預算／Token／Price／多維度策略）。 */
export type LimitBreachType =
  | "budget_breach"
  | "token_limit_breach"
  | "price_limit_breach"
  | "budget_policy_breach";

export interface LimitBreachEvent {
  id: string;
  companyId: string;
  type: LimitBreachType;
  occurredAt: Date;
  amountCents: number | null;
  tokenUsage: number | null;
  agentId: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

/** 多維度預算策略（API 回傳 ISO 日期字串）。 */
export interface BudgetPolicy {
  id: string;
  companyId: string;
  scopeType: "project" | "billing_code" | "company";
  projectId: string | null;
  billingCode: string | null;
  limitCents: number;
  period: string;
  onExceed: "record_only" | "block_new_runs_for_scope" | "pause_agents";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 依當月 UTC 累計與近兩週窗口的簡易預測／異常提示（與查詢區間的 spendCents 無關）。 */
export interface CostForecast {
  /** 當月迄今花費（UTC 月）。 */
  monthToDateSpendCents: number;
  /** 以日均推估的月底總花費（分）。 */
  monthProjectedSpendCents: number;
  /** 有設定月預算時，推估月底使用率（%）。 */
  monthProjectedUtilizationPercent: number;
  /** 推估月底會達或超過公司月預算（需 budgetCents > 0）。 */
  likelyMonthBudgetBreach: boolean;
  /** 最近 7 天（含）花費（分）。 */
  last7DaysSpendCents: number;
  /** 前 7 天（不含最近 7 天）花費（分）。 */
  previous7DaysSpendCents: number;
  /** 最近 7 天花費 > 2× 前 7 天（且前 7 天 > 0）。 */
  spendSpikeVsPreviousWeek: boolean;
}

export interface CostSummary {
  companyId: string;
  spendCents: number;
  budgetCents: number;
  utilizationPercent: number;
  /** 當月累計 token 使用量（input + output）。 */
  tokenUsage?: number;
  /**
   * 公司層級 Token **有效**上限（方案 entitlements 與公司覆寫合併後）；用於儀表／是否超標判斷。
   * null 表示未設上限（無方案與公司雙方限制）。
   */
  tokenLimit?: number | null;
  /**
   * 公司層級花費 **有效**上限（分）；語意同 tokenLimit。
   */
  priceLimitCents?: number | null;
  /**
   * 公司資料表上的 Token 覆寫值（不含方案合併）；null 表示未覆寫、沿用方案。
   * Costs 頁「公司上限」表單應綁定此欄，勿用 tokenLimit（否則清除覆寫後會顯示方案預設值）。
   */
  tokenLimitOverride?: number | null;
  /** 公司資料表上的花費覆寫值（分）；語意同 tokenLimitOverride。 */
  priceLimitCentsOverride?: number | null;
  /** 過去 N 天內的預算／Token／Price 觸發紀錄。 */
  breachEvents?: LimitBreachEvent[];
  /** 簡易月預測與週對週異常（UTC）。 */
  forecast?: CostForecast;
}

export interface CostByAgent {
  agentId: string;
  agentName: string | null;
  agentStatus: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
  apiRunCount: number;
  subscriptionRunCount: number;
  subscriptionInputTokens: number;
  subscriptionOutputTokens: number;
}

/** 依 cost_events.billing_code 彙總；null 表示未標示 billing code。 */
export interface CostByBillingCode {
  billingCode: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
}

/**
 * 依議題 request_depth 彙總（經 cost_events.issue_id → issues）。
 * null 表示無關聯議題或無法對應之列。
 */
export interface CostByRequestDepth {
  requestDepth: number | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
}
