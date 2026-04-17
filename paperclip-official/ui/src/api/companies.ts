import type {
  Company,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
  CreateAutomationRule,
  ImportPoliciesFromCompany,
  UpdateAutomationRule,
  UpsertCompanyHireApprovalPolicy,
} from "@paperclipai/shared";
import { api } from "./client";

export type CompanySubscriptionSummary = {
  planId: string;
  planSlug: string;
  planName: string;
  currentPeriodEnd: string | null;
  paymentProvider: string;
  status: string;
};

export type CompanyStats = Record<
  string,
  {
    agentCount: number;
    issueCount: number;
    subscription: CompanySubscriptionSummary | null;
  }
>;

/** GET /companies/:id/approval-policies/hire 回傳（無列時為預設物件）。 */
export type CompanyHireApprovalPolicy = {
  id?: string;
  companyId?: string;
  approvalType?: string;
  enabled: boolean;
  maxBudgetMonthlyCents: number | null;
};

export type AutomationRuleRow = {
  id: string;
  companyId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  trigger: Record<string, unknown>;
  actions: unknown[];
  createdAt: string;
  updatedAt: string;
};

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  /** Adapter types the current user can use in this company (by model.* permission). */
  allowedAdapterTypes: (companyId: string) =>
    api.get<{ adapterTypes: string[] }>(`/companies/${companyId}/allowed-adapter-types`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  updateManualSubscription: (companyId: string, body: { planId: string; currentPeriodEnd: string | null }) =>
    api.patch<{
      ok: true;
      subscription: CompanySubscriptionSummary;
    }>(`/companies/${companyId}/manual-subscription`, body),
  create: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
    api.post<Company>("/companies", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        | "name"
        | "description"
        | "status"
        | "budgetMonthlyCents"
        | "requireBoardApprovalForNewAgents"
        | "brandColor"
        | "iconAssetId"
        | "workingDirectory"
        | "wakeupsPausedUntil"
        | "wakeupsPausedReason"
        | "maintenanceWindows"
        | "complianceDataRetentionDays"
      >
    > & { moveWorkingDirectory?: boolean },
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  cleanupOrphans: () => api.post<{ ok: true }>("/companies/cleanup-orphans", {}),
  exportBundle: (
    companyId: string,
    data: {
      include?: {
        company?: boolean;
        agents?: boolean;
        approvalPolicies?: boolean;
        budgetPolicies?: boolean;
      };
    },
  ) => api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/export`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),
  getHireApprovalPolicy: (companyId: string) =>
    api.get<CompanyHireApprovalPolicy>(`/companies/${companyId}/approval-policies/hire`),
  updateHireApprovalPolicy: (companyId: string, body: UpsertCompanyHireApprovalPolicy) =>
    api.put<CompanyHireApprovalPolicy>(`/companies/${companyId}/approval-policies/hire`, body),
  listAutomationRules: (companyId: string) =>
    api.get<{ rules: AutomationRuleRow[] }>(`/companies/${companyId}/automation-rules`),
  createAutomationRule: (companyId: string, body: CreateAutomationRule) =>
    api.post<AutomationRuleRow>(`/companies/${companyId}/automation-rules`, body),
  updateAutomationRule: (companyId: string, ruleId: string, body: UpdateAutomationRule) =>
    api.patch<AutomationRuleRow>(`/companies/${companyId}/automation-rules/${ruleId}`, body),
  deleteAutomationRule: (companyId: string, ruleId: string) =>
    api.delete<{ ok: boolean }>(`/companies/${companyId}/automation-rules/${ruleId}`),
  importPoliciesFromCompany: (companyId: string, body: ImportPoliciesFromCompany) =>
    api.post<{ ok: boolean; warnings: string[] }>(
      `/companies/${companyId}/policies/import-from`,
      body,
    ),
};
