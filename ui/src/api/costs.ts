import type {
  BudgetPolicy,
  CostSummary,
  CostByAgent,
  CostByBillingCode,
  CostByRequestDepth,
} from "@paperclipai/shared";
import { api } from "./client";

export interface CostByProject {
  projectId: string | null;
  projectName: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
}

function dateParams(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface UpdateLimitsBody {
  tokenLimit?: number | null;
  priceLimitCents?: number | null;
}

export interface CreateBudgetPolicyBody {
  scopeType: "project" | "billing_code" | "company";
  projectId?: string | null;
  billingCode?: string | null;
  limitCents: number;
  period?: "calendar_month_utc";
  onExceed?: "record_only" | "block_new_runs_for_scope" | "pause_agents";
  enabled?: boolean;
}

export interface UpdateBudgetPolicyBody {
  limitCents?: number;
  onExceed?: "record_only" | "block_new_runs_for_scope" | "pause_agents";
  enabled?: boolean;
}

export const costsApi = {
  summary: (companyId: string, from?: string, to?: string) =>
    api.get<CostSummary>(`/companies/${companyId}/costs/summary${dateParams(from, to)}`),
  byAgent: (companyId: string, from?: string, to?: string) =>
    api.get<CostByAgent[]>(`/companies/${companyId}/costs/by-agent${dateParams(from, to)}`),
  byProject: (companyId: string, from?: string, to?: string) =>
    api.get<CostByProject[]>(`/companies/${companyId}/costs/by-project${dateParams(from, to)}`),
  byBillingCode: (companyId: string, from?: string, to?: string) =>
    api.get<CostByBillingCode[]>(`/companies/${companyId}/costs/by-billing-code${dateParams(from, to)}`),
  byRequestDepth: (companyId: string, from?: string, to?: string) =>
    api.get<CostByRequestDepth[]>(`/companies/${companyId}/costs/by-request-depth${dateParams(from, to)}`),
  updateLimits: (companyId: string, body: UpdateLimitsBody) =>
    api.patch<unknown>(`/companies/${companyId}/limits`, body),

  listBudgetPolicies: (companyId: string) =>
    api.get<BudgetPolicy[]>(`/companies/${companyId}/budget-policies`),
  createBudgetPolicy: (companyId: string, body: CreateBudgetPolicyBody) =>
    api.post<BudgetPolicy>(`/companies/${companyId}/budget-policies`, body),
  updateBudgetPolicy: (companyId: string, policyId: string, body: UpdateBudgetPolicyBody) =>
    api.patch<BudgetPolicy>(`/companies/${companyId}/budget-policies/${policyId}`, body),
  deleteBudgetPolicy: (companyId: string, policyId: string) =>
    api.delete<void>(`/companies/${companyId}/budget-policies/${policyId}`),
};
