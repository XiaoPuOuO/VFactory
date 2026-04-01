import type {
  BudgetPolicy,
  CostSummary,
  CostByAgent,
  CostByBillingCode,
  CostByRequestDepth,
} from "@paperclipai/shared";
import { api, ApiError, getTenantSlug } from "./client";

export interface CostByProject {
  projectId: string | null;
  projectName: string | null;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
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

  /**
   * 下載事件級 CSV（自動跟進 X-Export-Next-Cursor 直到完整）。
   * @param scopeAll 對應「全部時間」預設，不套用日期篩選。
   */
  async downloadCostEventsCsv(
    companyId: string,
    from?: string,
    to?: string,
    opts?: { scopeAll?: boolean },
  ): Promise<void> {
    const buildUrl = (cursor?: string): string => {
      const params = new URLSearchParams();
      if (opts?.scopeAll) params.set("scope", "all");
      else {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      params.set("limit", "5000");
      if (cursor) params.set("cursor", cursor);
      const qs = params.toString();
      return `/companies/${companyId}/costs/export?${qs}`;
    };

    const fetchExport = async (cursor?: string): Promise<Response> => {
      const headers = new Headers();
      if (getTenantSlug()) headers.set("X-Tenant-Slug", getTenantSlug()!);
      return fetch(`/api${buildUrl(cursor)}`, { credentials: "include", headers });
    };

    const first = await fetchExport();
    if (!first.ok) {
      const errorBody = await first.json().catch(() => null);
      throw new ApiError(
        (errorBody as { error?: string } | null)?.error ?? `Export failed: ${first.status}`,
        first.status,
        errorBody,
      );
    }
    let text = await first.text();
    let cursor = first.headers.get("X-Export-Next-Cursor");
    while (cursor) {
      const next = await fetchExport(cursor);
      if (!next.ok) {
        const errorBody = await next.json().catch(() => null);
        throw new ApiError(
          (errorBody as { error?: string } | null)?.error ?? `Export failed: ${next.status}`,
          next.status,
          errorBody,
        );
      }
      const body = await next.text();
      const lines = body.split("\n");
      if (lines.length > 1) {
        text += lines.slice(1).join("\n");
      }
      cursor = next.headers.get("X-Export-Next-Cursor");
    }

    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cost-events-${companyId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
