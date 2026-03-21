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

export interface CostSummary {
  companyId: string;
  spendCents: number;
  budgetCents: number;
  utilizationPercent: number;
  /** 當月累計 token 使用量（input + output）。 */
  tokenUsage?: number;
  /** 公司層級 Token 上限；null 表示未設定。 */
  tokenLimit?: number | null;
  /** 公司層級花費上限（分）；null 表示未設定。 */
  priceLimitCents?: number | null;
  /** 過去 N 天內的預算／Token／Price 觸發紀錄。 */
  breachEvents?: LimitBreachEvent[];
}

export interface CostByAgent {
  agentId: string;
  agentName: string | null;
  agentStatus: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
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
}
