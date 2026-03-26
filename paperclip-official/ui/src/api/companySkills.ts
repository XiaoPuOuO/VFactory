import { api } from "./client";

export type SkillMode = "active" | "passive";

export type CompanySkillListRow = {
  key: string;
  name: string;
  description: string;
  mode: SkillMode;
  skillMarkdown: string;
};

export type CompanySkillBundleV0 = {
  version: "v0";
  skills: Array<{
    skillMarkdown: string;
  }>;
};

export type ImportCompanySkillsRequest = {
  mode: "upsert" | "replace";
  skills: Array<{
    skillMarkdown: string;
  }>;
};

export const companySkillsApi = {
  list: (companyId: string) => api.get<{ skills: CompanySkillListRow[] }>(`/companies/${companyId}/skills`),

  exportLatest: (companyId: string) =>
    api.get<CompanySkillBundleV0>(`/companies/${companyId}/skills/export/latest`),

  importLatest: (companyId: string, body: ImportCompanySkillsRequest) =>
    api.post<{ ok: true }>(`/companies/${companyId}/skills/import`, body),

  create: (companyId: string, body: { skillMarkdown: string }) =>
    api.post<{ ok: true }>(`/companies/${companyId}/skills`, body),

  update: (companyId: string, skillKey: string, body: { skillMarkdown: string }) =>
    api.patch<{ ok: true }>(`/companies/${companyId}/skills/${encodeURIComponent(skillKey)}`, body),

  remove: (companyId: string, skillKey: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/skills/${encodeURIComponent(skillKey)}`),
};

