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
  getBillingIgnorePlanUsageCaps: () =>
    api.get<{ billingIgnorePlanUsageCaps: boolean }>(
      "/instance/settings/billing-ignore-plan-usage-caps",
    ),
  setBillingIgnorePlanUsageCaps: (billingIgnorePlanUsageCaps: boolean) =>
    api.put<{ billingIgnorePlanUsageCaps: boolean }>(
      "/instance/settings/billing-ignore-plan-usage-caps",
      { billingIgnorePlanUsageCaps },
    ),
  /** 公司管理手動指定方案：啟用中方案列表（admin.setting） */
  getPlanAssignOptions: () =>
    api.get<{ plans: { id: string; slug: string; name: string }[] }>(
      "/instance/settings/plan-assign-options",
    ),
};
