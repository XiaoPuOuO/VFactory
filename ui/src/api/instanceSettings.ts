import { api } from "./client";

export const instanceSettingsApi = {
  getDefaultCompanyPath: () =>
    api.get<{ defaultCompanyPath: string }>("/instance/settings/default-company-path"),
  setDefaultCompanyPath: (defaultCompanyPath: string) =>
    api.put<{ defaultCompanyPath: string }>("/instance/settings/default-company-path", {
      defaultCompanyPath,
    }),
  getComplianceDefaultRetention: () =>
    api.get<{ complianceDefaultRetentionDays: number | null }>(
      "/instance/settings/compliance-default-retention",
    ),
  setComplianceDefaultRetention: (complianceDefaultRetentionDays: number | null) =>
    api.put<{ complianceDefaultRetentionDays: number | null }>(
      "/instance/settings/compliance-default-retention",
      { complianceDefaultRetentionDays },
    ),
};
