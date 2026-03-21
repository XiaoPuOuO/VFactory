import type {
  Company,
  CompanyPortabilityExportResult,
  CompanyPortabilityImportRequest,
  CompanyPortabilityImportResult,
  CompanyPortabilityPreviewRequest,
  CompanyPortabilityPreviewResult,
  UpsertCompanyHireApprovalPolicy,
} from "@paperclipai/shared";
import { api } from "./client";

export type CompanyStats = Record<string, { agentCount: number; issueCount: number }>;

/** GET /companies/:id/approval-policies/hire 回傳（無列時為預設物件）。 */
export type CompanyHireApprovalPolicy = {
  id?: string;
  companyId?: string;
  approvalType?: string;
  enabled: boolean;
  maxBudgetMonthlyCents: number | null;
};

export const companiesApi = {
  list: () => api.get<Company[]>("/companies"),
  get: (companyId: string) => api.get<Company>(`/companies/${companyId}`),
  /** Adapter types the current user can use in this company (by model.* permission). */
  allowedAdapterTypes: (companyId: string) =>
    api.get<{ adapterTypes: string[] }>(`/companies/${companyId}/allowed-adapter-types`),
  stats: () => api.get<CompanyStats>("/companies/stats"),
  create: (data: { name: string; description?: string | null; budgetMonthlyCents?: number }) =>
    api.post<Company>("/companies", data),
  update: (
    companyId: string,
    data: Partial<
      Pick<
        Company,
        "name" | "description" | "status" | "budgetMonthlyCents" | "requireBoardApprovalForNewAgents" | "brandColor" | "iconAssetId" | "workingDirectory"
      >
    > & { moveWorkingDirectory?: boolean },
  ) => api.patch<Company>(`/companies/${companyId}`, data),
  archive: (companyId: string) => api.post<Company>(`/companies/${companyId}/archive`, {}),
  remove: (companyId: string) => api.delete<{ ok: true }>(`/companies/${companyId}`),
  cleanupOrphans: () => api.post<{ ok: true }>("/companies/cleanup-orphans", {}),
  exportBundle: (companyId: string, data: { include?: { company?: boolean; agents?: boolean } }) =>
    api.post<CompanyPortabilityExportResult>(`/companies/${companyId}/export`, data),
  importPreview: (data: CompanyPortabilityPreviewRequest) =>
    api.post<CompanyPortabilityPreviewResult>("/companies/import/preview", data),
  importBundle: (data: CompanyPortabilityImportRequest) =>
    api.post<CompanyPortabilityImportResult>("/companies/import", data),
  getHireApprovalPolicy: (companyId: string) =>
    api.get<CompanyHireApprovalPolicy>(`/companies/${companyId}/approval-policies/hire`),
  updateHireApprovalPolicy: (companyId: string, body: UpsertCompanyHireApprovalPolicy) =>
    api.put<CompanyHireApprovalPolicy>(`/companies/${companyId}/approval-policies/hire`, body),
};
